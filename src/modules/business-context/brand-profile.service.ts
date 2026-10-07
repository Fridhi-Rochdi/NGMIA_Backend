import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { LogoAssetService } from '../../common/brand-kit/logo-asset.service';
import { BrandPalette, extractPalette } from '../../common/brand-kit/palette';

/** The Prisma column defaults: a brand that still has them never chose colours. */
const UNSET = new Set(['#3b82f6', '#1e3a8a', '#22c55e']);
const HEX = /^#[0-9a-f]{6}$/i;

export interface BrandProfile {
  name: string;
  businessType: string | null;
  logoUrl: string | null;
  /** Null until the owner gives a logo or picks colours. */
  colors: BrandPalette | null;
  fonts: { heading: string; body: string };
}

/**
 * The visual half of the business profile: logo and colours.
 *
 * Collected once, at signup or in settings, and read by every generator. The
 * forms used to ship their own default colours with every request, and those
 * defaults won over the brand's: a bakery with a green logo received a navy
 * menu.
 */
@Injectable()
export class BrandProfileService {
  private readonly logger = new Logger(BrandProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandKit: BrandKitService,
    private readonly logoAssets: LogoAssetService,
  ) {}

  async get(tenantId: string): Promise<BrandProfile> {
    const kit = await this.brandKit.find(tenantId);
    const set = (v?: string | null) => (v && HEX.test(v) && !UNSET.has(v.toLowerCase()) ? v : '');
    const colors =
      kit && set(kit.colors.primary)
        ? {
            primary: set(kit.colors.primary),
            secondary: set(kit.colors.secondary) || kit.colors.secondary,
            accent: set(kit.colors.accent) || kit.colors.accent,
          }
        : null;
    return {
      name: kit?.name || '',
      businessType: kit?.business.businessType || null,
      logoUrl: kit?.logoUrl || null,
      colors,
      fonts: kit?.fonts || { heading: 'Inter', body: 'Inter' },
    };
  }

  /** The colours of an uploaded logo, without saving anything: the signup preview. */
  async palette(file: { buffer: Buffer } | undefined): Promise<BrandPalette> {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier recu.');
    const palette = await extractPalette(file.buffer).catch(() => null);
    if (!palette) {
      throw new BadRequestException(
        "Impossible de lire des couleurs dans ce logo. Choisissez-les a la main.",
      );
    }
    return palette;
  }

  /**
   * Save the logo and/or the colours on the tenant's brand.
   *
   * Colours chosen by the owner win; otherwise they are read from the logo.
   */
  async save(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string } | undefined,
    colors: Partial<BrandPalette>,
  ): Promise<BrandProfile> {
    const chosen = {
      primary: HEX.test(colors.primary || '') ? colors.primary! : '',
      secondary: HEX.test(colors.secondary || '') ? colors.secondary! : '',
      accent: HEX.test(colors.accent || '') ? colors.accent! : '',
    };

    let logo: string | null = null;
    let logoVariants: Record<string, string> | null = null;
    let extracted: BrandPalette | null = null;
    if (file?.buffer?.length) {
      extracted = await extractPalette(file.buffer).catch(() => null);
      const dataUrl = `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
      const stored = await this.logoAssets.store(dataUrl, `t-${tenantId}`);
      if (!stored) throw new BadRequestException("Le logo n'a pas pu etre enregistre.");
      logo = stored.primary;
      logoVariants = Object.fromEntries(Object.entries(stored).filter(([, v]) => Boolean(v))) as Record<string, string>;
    }

    const palette = {
      primary: chosen.primary || extracted?.primary || '',
      secondary: chosen.secondary || extracted?.secondary || '',
      accent: chosen.accent || extracted?.accent || '',
    };

    const data = {
      ...(logo ? { logo, logoVariants: logoVariants as any } : {}),
      ...(palette.primary ? { primaryColor: palette.primary } : {}),
      ...(palette.secondary ? { secondaryColor: palette.secondary } : {}),
      ...(palette.accent ? { accentColor: palette.accent } : {}),
    };
    if (!Object.keys(data).length) return this.get(tenantId);

    const brand = await this.prisma.brand.findFirst({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
    if (brand) {
      await this.prisma.brand.update({ where: { id: brand.id }, data });
    } else {
      const context = await this.prisma.businessContext.findUnique({ where: { tenantId } });
      const name = context?.businessName || 'Ma marque';
      await this.prisma.brand.create({
        data: {
          name,
          slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marque'}-${Date.now()}`,
          tenantId,
          ...data,
        },
      });
    }
    this.logger.log(`Marque mise a jour pour ${tenantId}: ${Object.keys(data).join(', ')}`);
    return this.get(tenantId);
  }
}
