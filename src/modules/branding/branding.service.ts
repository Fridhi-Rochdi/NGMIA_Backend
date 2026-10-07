import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateBrandingDto, UpdateBrandingDto, RegenerateLogoDto } from './branding.dto';
import { LogoAssetService } from '../../common/brand-kit/logo-asset.service';
import { StorageService } from '../../common/storage/storage.service';
import { BusinessContextService } from '../business-context/business-context.service';

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly logoAssets: LogoAssetService,
    private readonly storage: StorageService,
    private readonly businessContext: BusinessContextService,
  ) {}

  /**
   * Generate a complete brand identity including logo.
   * Step 1: LLM generates branding strategy (colors, typography, tagline, etc.)
   * Step 2: LLM generates a professional SVG logo based on the branding
   */
  async generateBranding(userId: string, tenantId: string, dto: GenerateBrandingDto) {
    this.logger.log(`Generating branding for "${dto.brandName}" (${dto.industry})`);

    // Step 1: Generate brand strategy via LLM, from the whole business
    // profile: offer, audience, tone and language, not just a name and a line.
    const context = await this.businessContext.find(tenantId);
    const branding = await this.aiEngine.generateBranding({
      brandName: dto.brandName,
      industry: dto.industry,
      description: dto.description,
      style: dto.style || 'modern',
      values: dto.values,
      businessType: context?.businessType,
      services: context?.services,
      targetAudience: context?.targetAudience || undefined,
      tone: context?.tone,
      language: context?.language,
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
      // The concept written for the mark, not the marketing description.
      const logoDesc = branding.logoConcept || branding.description || dto.description || '';
      logoUrl = await this.generateLogoWithRetry({
        brandName: dto.brandName,
        industry: dto.industry,
        style: dto.style || 'modern',
        logoDescription: logoDesc,
        primaryColor,
        secondaryColor,
        accentColor,
      });
      this.logger.log('Logo genere');
    } catch (error) {
      this.logger.error(`Logo generation failed, continuing without logo: ${error}`);
      // Branding without logo is still usable — user can regenerate later
    }

    // The generator hands back a base64 data URL. Persisted as-is that is a
    // megabyte of text in the row, re-inlined into every document showing the
    // logo. Store it as files and derive the variants an identity needs.
    let logoVariants: any = null;
    if (logoUrl) {
      const patch = await this.storeLogo(logoUrl, tenantId);
      logoUrl = patch.logo;
      logoVariants = patch.logoVariants;
      if (logoVariants) {
        this.logger.log(`Logo stocke: ${Object.keys(logoVariants).join(', ')}`);
      }
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
        logoVariants: logoVariants as any,
        tagline: branding.tagline,
        description: branding.description,
        // Tone of VOICE. The form's `style` is a visual choice and used to be
        // stored here, so "modern" reached every copy prompt as a tone.
        tone: context?.tone || 'professional',
        industry: dto.industry,
        targetAudience: context?.targetAudience || null,
        primaryColor,
        secondaryColor,
        accentColor,
        // Both fonts, as a CSS font-family list; BrandKit splits it.
        fontFamily: [headingFont, bodyFont].filter(Boolean).join(', ') || 'Inter',
        mission: branding.mission || null,
        vision: branding.vision || null,
        personality: branding.personality || null,
        messagingAngle: branding.messagingAngle || null,
        voice: branding.voice || null,
        logoConcept: branding.logoConcept || null,
        visualStyle: branding.visualStyle || null,
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
        logoDescription: branding.logoConcept || branding.description || dto.description,
        hasLogo: !!logoUrl,
      },
    };
  }

  /**
   * Regenerate only the logo for an existing brand.
   * Uses the stored brand colors and description.
   */
  /**
   * Persist a freshly generated logo as files and return the DB patch.
   * Shared by generate / regenerate / modify so a logo can never be written
   * back as a base64 blob through one path and as a file through another.
   */
  /**
   * Generate a logo, sweeping failures.
   *
   * The image provider returns intermittent 500s. Menu and website photography
   * goes through BrandAssetService.renderAll(), which retries the slots that
   * missed; the logo call had no such sweep, so a single wobble left a brand
   * permanently without its logo — and a brand without a logo is not a brand.
   *
   * Failures cluster in time, so a short pause between attempts is what makes
   * the difference, not more attempts back to back.
   */
  private async generateLogoWithRetry(
    options: Parameters<AiEngineService['generateLogo']>[0],
    attempts = Number(process.env.LOGO_ATTEMPTS || 4),
  ): Promise<string> {
    let lastError: Error = new Error('Logo generation failed');

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        // This called itself, not the engine — unbounded recursion that blew
        // the stack on the first attempt, so EVERY logo generation failed with
        // "Maximum call stack size exceeded" and every brand was saved without
        // one. The sweep below never ran a single real attempt.
        const url = await this.aiEngine.generateLogo(options);
        if (attempt > 1) this.logger.log(`Logo obtenu a la tentative ${attempt}`);
        return url;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // A rejected request will be rejected identically next time; only
        // transient faults are worth another attempt.
        if (!/\b(429|5\d\d)\b|timeout|ETIMEDOUT|ECONNRESET|repondu en/i.test(lastError.message)) {
          throw lastError;
        }
        this.logger.warn(
          `Logo, tentative ${attempt}/${attempts} echouee: ${lastError.message.slice(0, 90)}`,
        );
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 6000 * attempt));
        }
      }
    }

    throw lastError;
  }

  private async storeLogo(logoUrl: string, tenantId: string) {
    const stored = await this.logoAssets.store(logoUrl, `t-${tenantId}`);
    if (!stored) return { logo: logoUrl, logoVariants: null as any };
    return {
      logo: stored.primary,
      logoVariants: Object.fromEntries(
        Object.entries(stored).filter(([, v]) => Boolean(v)),
      ) as any,
    };
  }

  async regenerateLogo(id: string, tenantId: string, dto?: RegenerateLogoDto) {
    const brand = await this.findOne(id, tenantId);

    this.logger.log(`Regenerating logo for brand "${brand.name}"`);

    // Build a logo description from the brand data
    const logoDescription = dto?.logoDescription || brand.logoConcept || '';

    let logoUrl: string;
    try {
      logoUrl = await this.generateLogoWithRetry({
        brandName: brand.name,
        industry: brand.industry || undefined,
        style: (brand.visualStyle || 'modern').toLowerCase(),
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

    // Update the brand with the new logo, stored as files.
    return this.prisma.brand.update({
      where: { id },
      data: await this.storeLogo(logoUrl, tenantId),
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

    // Logos are stored as files now; brands created before that still hold a
    // base64 data URI, so both shapes have to be readable.
    let originalMime: string;
    let buffer: Buffer;

    if (brand.logo.startsWith('/uploads/')) {
      const stored = this.storage.readByPublicUrl(brand.logo);
      if (!stored) {
        throw new NotFoundException('Le fichier du logo est introuvable. Régénérez le logo.');
      }
      originalMime = stored.mime.toLowerCase();
      buffer = stored.buffer;
    } else {
      const match = brand.logo.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
      if (!match) {
        throw new Error('Format de logo invalide. Régénérez le logo.');
      }
      originalMime = match[1].toLowerCase();
      buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    }

    if (!buffer.length) {
      throw new Error('Le logo décodé est vide. Régénérez le logo.');
    }

    const isSvg = originalMime.includes('svg');
    const requested = (format || 'original').toLowerCase();

    const TARGETS: Record<string, { mime: string; ext: string; sharp?: 'png' | 'jpeg' | 'webp' }> = {
      svg: { mime: 'image/svg+xml', ext: 'svg' },
      png: { mime: 'image/png', ext: 'png', sharp: 'png' },
      jpg: { mime: 'image/jpeg', ext: 'jpg', sharp: 'jpeg' },
      jpeg: { mime: 'image/jpeg', ext: 'jpg', sharp: 'jpeg' },
      webp: { mime: 'image/webp', ext: 'webp', sharp: 'webp' },
    };

    const ORIGINAL: Record<string, { mime: string; ext: string }> = {
      'image/svg+xml': { mime: 'image/svg+xml', ext: 'svg' },
      'image/png': { mime: 'image/png', ext: 'png' },
      'image/jpeg': { mime: 'image/jpeg', ext: 'jpg' },
      'image/webp': { mime: 'image/webp', ext: 'webp' },
    };

    let mimeType: string;
    let extension: string;

    // Asking for SVG when the source is a raster image is impossible; serve the
    // original rather than handing back a file whose extension lies.
    if (requested === 'svg' && !isSvg) {
      const source = ORIGINAL[originalMime] || { mime: originalMime, ext: 'png' };
      mimeType = source.mime;
      extension = source.ext;
    } else if (requested === 'original' || !TARGETS[requested]) {
      const source = ORIGINAL[originalMime] || { mime: originalMime, ext: 'png' };
      mimeType = source.mime;
      extension = source.ext;
    } else {
      const target = TARGETS[requested];
      const alreadyRight = ORIGINAL[originalMime]?.ext === target.ext;

      if (alreadyRight || !target.sharp) {
        mimeType = target.mime;
        extension = target.ext;
      } else {
        // Real conversion. sharp reads SVG as well as raster input, so this is
        // what turns an SVG logo into an actual PNG instead of merely
        // relabelling the bytes — which produced files no viewer could open.
        try {
          buffer = await sharp(buffer, { density: 384 })
            .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFormat(target.sharp, target.sharp === 'jpeg' ? { quality: 92 } : {})
            .toBuffer();
          mimeType = target.mime;
          extension = target.ext;
        } catch (conversionError) {
          this.logger.error(
            `Logo conversion ${originalMime} -> ${target.ext} failed: ${conversionError}. Serving the original.`,
          );
          const source = ORIGINAL[originalMime] || { mime: originalMime, ext: 'png' };
          mimeType = source.mime;
          extension = source.ext;
        }
      }
    }

    this.logger.log(
      `Downloading logo for brand "${brand.name}" as ${extension} (${buffer.length} bytes, ${mimeType})`,
    );

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
    const style = dto.style || (brand.visualStyle || 'modern').toLowerCase();

    const logoDescription = dto.logoDescription || brand.logoConcept || '';

    this.logger.log(`Modifying logo for brand "${brand.name}"`);

    let logoUrl: string;
    try {
      logoUrl = await this.generateLogoWithRetry({
        brandName: brand.name,
        industry: brand.industry || undefined,
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
    const updateData: any = await this.storeLogo(logoUrl, tenantId);
    if (dto.primaryColor) updateData.primaryColor = dto.primaryColor;
    if (dto.secondaryColor) updateData.secondaryColor = dto.secondaryColor;
    if (dto.accentColor) updateData.accentColor = dto.accentColor;
    // A logo style is a visual choice; the tone of voice is left alone.

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
