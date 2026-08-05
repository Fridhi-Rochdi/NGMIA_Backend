import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateBrandingDto, UpdateBrandingDto, RegenerateLogoDto } from './branding.dto';

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

    // Step 1: Generate brand strategy via LLM
    const branding = await this.aiEngine.generateBranding({
      brandName: dto.brandName,
      industry: dto.industry,
      description: dto.description,
      style: dto.style || 'modern',
      values: dto.values,
    });

    this.logger.log(`Brand strategy generated — palette: ${branding.colorPalette}`);

    // Extract primary/secondary/accent colors from the palette
    const colorArray = branding.colorPalette.split(',').map(c => c.trim());
    const primaryColor = colorArray[0] || '#3B82F6';
    const secondaryColor = colorArray[1] || '#1E3A5F';
    const accentColor = colorArray[2] || '#F59E0B';

    // Step 2: Generate logo via NVIDIA NIM IMAGE GENERATION API (real PNG/SVG)
    let logoUrl: string | null = null;
    try {
      logoUrl = await this.aiEngine.generateLogo({
        brandName: dto.brandName,
        industry: dto.industry,
        style: dto.style || 'modern',
        logoDescription: branding.logoDescription,
        primaryColor,
        secondaryColor,
        accentColor,
      });
      const logoType = logoUrl.startsWith('data:image/png') ? 'PNG (image API)' : 'SVG (fallback)';
      this.logger.log(`Logo generated successfully via ${logoType} (${logoUrl.substring(0, 50)}...)`);
    } catch (error) {
      this.logger.error(`Logo generation failed, continuing without logo: ${error}`);
      // Branding without logo is still usable — user can regenerate later
    }

    // Generate unique slug (append timestamp to avoid duplicates)
    const baseSlug = dto.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${Date.now()}`;

    const [headingFont, bodyFont] = branding.typography.split(',').map(f => f.trim());

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
        fontFamily: headingFont || 'Inter',
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
        logoDescription: branding.logoDescription,
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
   */
  async downloadLogo(id: string, tenantId: string, format: string) {
    const brand = await this.findOne(id, tenantId);

    if (!brand.logo) {
      throw new NotFoundException('Aucun logo trouvé pour cette marque. Générez-en un d\'abord.');
    }

    const logoDataUri = brand.logo;

    // Parse the data URI: data:image/svg+xml;base64,XXXXX or data:image/jpeg;base64,XXXXX
    const match = logoDataUri.match(/^data:(image\/[^;]+);base64,(.+)$/);
    
    if (!match) {
      throw new Error('Format de logo invalide. Régénérez le logo.');
    }

    const originalMime = match[1]; // e.g., "image/svg+xml" or "image/jpeg"
    const base64Data = match[2];
    let buffer = Buffer.from(base64Data, 'base64');

    // Determine output format
    let mimeType: string;
    let extension: string;

    switch (format.toLowerCase()) {
      case 'svg':
        // SVG can only be returned if the original is SVG
        if (originalMime.includes('svg')) {
          mimeType = 'image/svg+xml';
          extension = 'svg';
        } else {
          // Return JPEG as fallback
          mimeType = 'image/jpeg';
          extension = 'jpg';
        }
        break;
      case 'jpeg':
      case 'jpg':
        mimeType = 'image/jpeg';
        extension = 'jpg';
        // If original is SVG, keep the raw SVG data (browser will render it)
        break;
      case 'png':
      default:
        mimeType = 'image/png';
        extension = 'png';
        break;
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
