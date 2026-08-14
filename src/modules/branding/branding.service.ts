import { Injectable, NotFoundException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateBrandingDto, UpdateBrandingDto, RegenerateLogoDto } from './branding.dto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  /**
   * Generate a complete brand identity including logo.
   * Step 1: LLM generates branding strategy (colors, typography, tagline, etc.)
   * Step 2: LLM generates a professional SVG logo based on the branding
   */
  async generateBranding(userId: string, tenantId: string, dto: GenerateBrandingDto) {
    this.logger.log(`Generating branding for "${dto.brandName}" (${dto.industry})`);

    let branding: Awaited<ReturnType<AiEngineService['generateBranding']>>;
    try {
      branding = await this.aiEngine.generateBranding({
        brandName: dto.brandName,
        industry: dto.industry,
        description: dto.description,
        style: dto.style || 'modern',
        values: dto.values,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Brand strategy generation failed: ${reason}`);
      throw new ServiceUnavailableException(
        `La génération IA du branding a échoué: ${reason}. Aucune identité par défaut n'a été créée; veuillez réessayer.`,
      );
    }

    this.logger.log(`Brand strategy generated — palette: ${branding.colorPalette}`);

    const colorArray = branding.colorPalette.split(',').map(c => c.trim());
    if (colorArray.length !== 3 || colorArray.some(color => !/^#[0-9a-f]{6}$/i.test(color))) {
      this.logger.error(`Invalid AI color palette: ${branding.colorPalette}`);
      throw new ServiceUnavailableException(
        `La génération IA du branding a retourné une palette invalide: ${branding.colorPalette}. Aucune identité par défaut n'a été créée; veuillez réessayer.`,
      );
    }
    const [primaryColor, secondaryColor, accentColor] = colorArray;

    // Step 2: Generate logo via NVIDIA NIM IMAGE GENERATION API (real PNG/SVG)
    let logoUrl: string;
    try {
      const logoDesc = [
        branding.logoConcept,
        branding.visualStyle,
        branding.personality,
        branding.messagingAngle,
      ].filter(Boolean).join(' ');
      logoUrl = await this.aiEngine.generateLogo({
        brandName: dto.brandName,
        industry: dto.industry,
        style: dto.style || 'modern',
        logoDescription: logoDesc,
        primaryColor,
        secondaryColor,
        accentColor,
      });
      const logoType = logoUrl.startsWith('data:image/png') ? 'PNG image API' : 'image API';
      this.logger.log(`Logo generated successfully via ${logoType} (${logoUrl.substring(0, 50)}...)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Logo generation failed: ${reason}`);
      throw new ServiceUnavailableException(
        `La génération IA du logo a échoué: ${reason}. Aucune identité par défaut n'a été créée; veuillez réessayer.`,
      );
    }

    // Generate unique slug (append timestamp to avoid duplicates)
    const baseSlug = dto.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${Date.now()}`;

    const [headingFont, bodyFont] = branding.typography.split(',').map(f => f.trim());
    if (!headingFont || !bodyFont) {
      this.logger.error(`Invalid AI typography: ${branding.typography}`);
      throw new ServiceUnavailableException(
        `La génération IA du branding a retourné une typographie invalide: ${branding.typography}. Aucune identité par défaut n'a été créée; veuillez réessayer.`,
      );
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.brandName,
        slug,
        logo: logoUrl,
        tagline: branding.tagline,
        description: branding.description,
        tone: dto.style || 'professional',
        industry: dto.industry,
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily: headingFont,
        tenantId,
      },
    });

    return {
      ...brand,
      _brandingDetails: {
        mission: branding.mission,
        vision: branding.vision,
        colorPalette: colorArray,
        typography: { heading: headingFont, body: bodyFont },
        personality: branding.personality,
        visualStyle: branding.visualStyle,
        messagingAngle: branding.messagingAngle,
        logoDescription: branding.logoConcept || branding.description || dto.description,
        hasLogo: !!logoUrl,
      },
    };
  }

  /**
   * Regenerate only the logo for an existing brand.
   * Uses the stored brand colors and description.
   */
  async regenerateLogo(id: string, tenantId: string, dto?: RegenerateLogoDto) {
    const brand = await this.findOne(id, tenantId);

    this.logger.log(`Regenerating logo for brand "${brand.name}"`);

    // Build a logo description from the brand data
    const logoDescription = dto?.logoDescription 
      || `Modern ${brand.tone} style logo for ${brand.name}, ${brand.industry} industry, using ${brand.primaryColor} and ${brand.accentColor} colors, professional and memorable`;

    let logoUrl: string;
    try {
      logoUrl = await this.aiEngine.generateLogo({
        brandName: brand.name,
        industry: brand.industry || 'technology',
        style: brand.tone || 'modern',
        logoDescription,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
      });
      this.logger.log(`Logo regenerated (${logoUrl.length} chars)`);
    } catch (error) {
      this.logger.error(`Logo regeneration failed: ${error}`);
      throw new Error('Échec de la régénération du logo. Veuillez réessayer.');
    }

    // Update the brand with the new logo
    return this.prisma.brand.update({
      where: { id },
      data: { logo: logoUrl },
    });
  }

  /**
   * Download the logo in the requested format.
   * Converts the stored data URI to a raw buffer with proper MIME type.
   * Supports: base64 data URIs (PNG/JPEG/WEBP), SVG text, double-prefixed URIs, plain URLs.
   */
  async downloadLogo(id: string, tenantId: string, format: string) {
    const brand = await this.findOne(id, tenantId);

    if (!brand.logo) {
      throw new NotFoundException('Aucun logo trouvé pour cette marque. Générez-en un d\'abord.');
    }

    const logoDataUri = brand.logo;
    let buffer: Buffer;
    let originalMime: string;

    // --- Case 1: Base64 data URI (e.g., data:image/png;base64,iVBOR...) ---
    // Use [\s\S]+ instead of .+ to match base64 across multiple lines
    const base64Match = logoDataUri.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/i);
    if (base64Match) {
      originalMime = base64Match[1].toLowerCase();
      let rawBase64 = base64Match[2].replace(/\s+/g, '');

      // Handle double-prefixed data URIs (data:image/png;base64,data:image/png;base64,...)
      const doublePrefixMatch = rawBase64.match(/^data:image\/[^;]+;base64,([\s\S]+)$/i);
      if (doublePrefixMatch) {
        this.logger.warn('Detected double-prefixed data URI, unwrapping inner base64');
        rawBase64 = doublePrefixMatch[1].replace(/\s+/g, '');
      }

      buffer = Buffer.from(rawBase64, 'base64');
      this.logger.log(`Decoded base64 logo: ${originalMime}, raw=${rawBase64.length} chars → buffer=${buffer.length} bytes`);

      if (buffer.length === 0) {
        throw new Error('Le logo décodé est vide. Le format base64 est peut-être corrompu. Régénérez le logo.');
      }
    } else {
      // --- Case 2: SVG text data URI (data:image/svg+xml,<svg>...) without base64 ---
      const svgTextMatch = logoDataUri.match(/^data:image\/svg\+xml,([\s\S]+)$/i);
      if (svgTextMatch) {
        originalMime = 'image/svg+xml';
        const svgContent = decodeURIComponent(svgTextMatch[1]);
        buffer = Buffer.from(svgContent, 'utf-8');
        this.logger.log(`Decoded SVG text logo: ${buffer.length} bytes`);
      } else if (/^<svg[\s\S]*<\/svg>\s*$/i.test(logoDataUri.trim())) {
        // --- Case 3: Raw SVG string ---
        originalMime = 'image/svg+xml';
        buffer = Buffer.from(logoDataUri.trim(), 'utf-8');
        this.logger.log(`Raw SVG logo: ${buffer.length} bytes`);
      } else if (/^https?:\/\//i.test(logoDataUri)) {
        // --- Case 4: Plain URL ---
        this.logger.log(`Fetching logo from URL: ${logoDataUri.substring(0, 80)}...`);
        try {
          const response = await fetch(logoDataUri);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          const contentType = response.headers.get('content-type') || 'image/png';
          originalMime = contentType.split(';')[0].trim().toLowerCase();
          this.logger.log(`Fetched logo from URL: ${buffer.length} bytes, mime=${originalMime}`);
        } catch (fetchError) {
          this.logger.error(`Failed to fetch logo URL: ${fetchError}`);
          throw new Error('Impossible de télécharger le logo depuis l\'URL distante. Régénérez le logo.');
        }
      } else {
        this.logger.error(`Unrecognized logo format. Starts with: ${logoDataUri.substring(0, 60)}`);
        throw new Error('Format de logo invalide. Régénérez le logo.');
      }
    }

    // --- Format conversion ---
    const targetFormat = (format || 'original').toLowerCase();
    const extensionByMime: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };

    let mimeType = originalMime;
    let extension = extensionByMime[originalMime] || originalMime.split('/')[1] || 'png';

    // Only attempt sharp conversion for raster formats (not SVG)
    if (targetFormat !== 'original' && originalMime !== 'image/svg+xml') {
      const formatMap: Record<string, { mime: string; ext: string }> = {
        png: { mime: 'image/png', ext: 'png' },
        jpg: { mime: 'image/jpeg', ext: 'jpg' },
        jpeg: { mime: 'image/jpeg', ext: 'jpg' },
        webp: { mime: 'image/webp', ext: 'webp' },
      };
      const target = formatMap[targetFormat];
      if (target && target.ext !== extension) {
        try {
          this.logger.log(`Converting logo from ${extension} to ${target.ext}`);
          buffer = await sharp(buffer)
            .toFormat(target.ext as 'png' | 'jpeg' | 'webp')
            .toBuffer();
          mimeType = target.mime;
          extension = target.ext;
          this.logger.log(`Converted logo: ${buffer.length} bytes`);
        } catch (convError) {
          this.logger.error(`Format conversion failed (${extension}→${target.ext}): ${convError}. Sending original format.`);
          // Fall back to original format
        }
      }
    }

    this.logger.log(`Downloading logo for brand "${brand.name}" as ${extension} (${buffer.length} bytes)`);

    return { buffer, mimeType, extension };
  }

  /**
   * Delete/remove the logo from a brand.
   */
  async deleteLogo(id: string, tenantId: string) {
    const brand = await this.findOne(id, tenantId);

    if (!brand.logo) {
      throw new NotFoundException('Aucun logo à supprimer.');
    }

    this.logger.log(`Deleting logo for brand "${brand.name}"`);

    return this.prisma.brand.update({
      where: { id },
      data: { logo: null },
    });
  }

  /**
   * Modify/update the logo with new parameters.
   * Regenerates the logo using the provided or existing brand settings.
   */
  async modifyLogo(id: string, tenantId: string, dto: any) {
    const brand = await this.findOne(id, tenantId);

    const primaryColor = dto.primaryColor || brand.primaryColor;
    const secondaryColor = dto.secondaryColor || brand.secondaryColor;
    const accentColor = dto.accentColor || brand.accentColor;
    const style = dto.style || brand.tone || 'modern';

    const logoDescription = dto.logoDescription 
      || `Modern ${style} style logo for ${brand.name}, ${brand.industry || 'technology'} industry, professional and memorable`;

    this.logger.log(`Modifying logo for brand "${brand.name}"`);

    let logoUrl: string;
    try {
      logoUrl = await this.aiEngine.generateLogo({
        brandName: brand.name,
        industry: brand.industry || 'technology',
        style,
        logoDescription,
        primaryColor,
        secondaryColor,
        accentColor,
      });
      this.logger.log(`Logo modified (${logoUrl.length} chars)`);
    } catch (error) {
      this.logger.error(`Logo modification failed: ${error}`);
      throw new Error('Échec de la modification du logo. Veuillez réessayer.');
    }

    // Update brand with new logo and optionally new colors
    const updateData: any = { logo: logoUrl };
    if (dto.primaryColor) updateData.primaryColor = dto.primaryColor;
    if (dto.secondaryColor) updateData.secondaryColor = dto.secondaryColor;
    if (dto.accentColor) updateData.accentColor = dto.accentColor;
    if (dto.style) updateData.tone = dto.style;

    return this.prisma.brand.update({
      where: { id },
      data: updateData,
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, tenantId },
    });
    if (!brand) throw new NotFoundException('Marque introuvable');
    return brand;
  }

  async update(id: string, tenantId: string, dto: UpdateBrandingDto) {
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.tagline) updateData.tagline = dto.tagline;
    if (dto.description) updateData.description = dto.description;
    if (dto.primaryColor) updateData.primaryColor = dto.primaryColor;
    if (dto.secondaryColor) updateData.secondaryColor = dto.secondaryColor;
    if (dto.accentColor) updateData.accentColor = dto.accentColor;
    if (dto.fontFamily) updateData.fontFamily = dto.fontFamily;
    if (dto.tone) updateData.tone = dto.tone;
    if (dto.industry) updateData.industry = dto.industry;
    if (dto.targetAudience) updateData.targetAudience = dto.targetAudience;

    return this.prisma.brand.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.brand.delete({ where: { id } });
  }
}
