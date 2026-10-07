import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArtDirection, VISUAL_STYLE_KEYS, buildArtDirection } from './art-direction';

/**
 * The tenant's one visual identity.
 *
 * A tenant accumulates a `Brand` row per branding generation. Without a single
 * place that decides which one is current, the logo generator, the site
 * generator and the menu generator each picked their own defaults — which is
 * how you end up with a logo in one identity and a website in another.
 *
 * Everything that generates anything visual resolves the kit here first, and
 * only falls back to its own defaults for fields the kit does not have.
 */

export interface BrandKit {
  /** Null when the tenant has never generated or saved a brand. */
  brandId: string | null;
  name: string;
  logoUrl: string | null;
  colors: { primary: string; secondary: string; accent: string };
  fonts: { heading: string; body: string };
  tagline: string | null;
  tone: string;
  /** The art-direction style key, derived from the kit. */
  style: string;
  industry: string | null;
  targetAudience: string | null;
  /** The business facts every generator writes from (BusinessContext). */
  business: {
    businessType: string | null;
    description: string;
    services: string[];
    language: string;
    currency: string;
    contactPhone: string | null;
    contactEmail: string | null;
    contactAddress: string | null;
    website: string | null;
  };
  /** The generated brand platform, when the tenant ran a branding. */
  platform: {
    mission: string | null;
    vision: string | null;
    personality: string | null;
    messagingAngle: string | null;
    voice: string | null;
    logoConcept: string | null;
  };
}

@Injectable()
export class BrandKitService {
  private readonly logger = new Logger(BrandKitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tenant's current kit: the most recently updated brand, backed by the
   * business context for anything the brand does not carry.
   *
   * Returns null only when the tenant has neither — callers then keep their
   * own per-trade defaults.
   */
  async find(tenantId: string): Promise<BrandKit | null> {
    const [brand, context] = await Promise.all([
      this.prisma.brand.findFirst({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.businessContext.findUnique({ where: { tenantId } }),
    ]);

    if (!brand && !context) return null;

    const fonts = String(brand?.fontFamily || 'Inter')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    return {
      brandId: brand?.id ?? null,
      name: brand?.name || context?.businessName || '',
      logoUrl: brand?.logo || null,
      colors: {
        primary: brand?.primaryColor || '',
        secondary: brand?.secondaryColor || '',
        accent: brand?.accentColor || '',
      },
      fonts: { heading: fonts[0] || 'Inter', body: fonts[1] || fonts[0] || 'Inter' },
      tagline: brand?.tagline ?? null,
      // The business context is where the user states their tone of voice.
      // Brand.tone used to receive the branding form's *visual* style
      // ("modern"), which then leaked into every copy prompt as a tone.
      tone: context?.tone || brand?.tone || 'professional',
      style: this.normaliseStyle(brand?.visualStyle) || this.styleFor(brand?.tone, context?.businessType),
      industry: brand?.industry || context?.industry || null,
      targetAudience: brand?.targetAudience || context?.targetAudience || null,
      business: {
        businessType: context?.businessType || null,
        description: context?.description || brand?.description || '',
        services: context?.services || [],
        language: context?.language || 'fr',
        currency: context?.currency || 'EUR',
        contactPhone: context?.contactPhone || null,
        contactEmail: context?.contactEmail || null,
        contactAddress: context?.contactAddress || null,
        website: context?.website || null,
      },
      platform: {
        mission: brand?.mission || null,
        vision: brand?.vision || null,
        personality: brand?.personality || null,
        messagingAngle: brand?.messagingAngle || null,
        voice: brand?.voice || null,
        logoConcept: brand?.logoConcept || null,
      },
    };
  }

  /**
   * Merge the kit over a caller's defaults.
   *
   * The precedence is: what the user typed on this form, then the tenant's
   * brand, then the caller's per-trade default. A brand colour only wins when
   * it is a real hex — the Brand model defaults every colour to the same blue,
   * and letting that through is what made every generated asset look alike.
   */
  apply<T extends { primary?: string; secondary?: string; accent?: string }>(
    explicit: T,
    kit: BrandKit | null,
    fallback: { primary: string; secondary: string; accent: string },
  ): { primary: string; secondary: string; accent: string } {
    const hex = (v?: string | null) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '');
    // The Prisma defaults; treated as "unset" rather than as a choice.
    const UNSET = new Set(['#3b82f6', '#1e3a8a', '#22c55e']);
    const fromKit = (v?: string | null) => {
      const h = hex(v);
      return h && !UNSET.has(h.toLowerCase()) ? h : '';
    };

    return {
      primary: hex(explicit.primary) || fromKit(kit?.colors.primary) || fallback.primary,
      secondary: hex(explicit.secondary) || fromKit(kit?.colors.secondary) || fallback.secondary,
      accent: hex(explicit.accent) || fromKit(kit?.colors.accent) || fallback.accent,
    };
  }

  /**
   * One art direction per tenant, so a dish photo, a hero shot and a poster
   * visual generated weeks apart still belong to the same brand.
   */
  direction(tenantId: string, kit: BrandKit | null, colors: string[], style?: string): ArtDirection {
    return buildArtDirection({
      brandKey: `t-${tenantId}:${kit?.name || ''}`,
      style: style || kit?.style,
      colors,
    });
  }

  /** A stored style key, or '' when the brand never chose one. */
  private normaliseStyle(value?: string | null): string {
    const key = String(value || '').trim().toUpperCase();
    return VISUAL_STYLE_KEYS.includes(key as any) ? key : '';
  }

  /** Map the brand's declared tone onto a photographic style. */
  private styleFor(tone?: string | null, businessType?: string | null): string {
    const t = `${tone || ''} ${businessType || ''}`.toLowerCase();
    if (/luxe|luxury|premium|elegant|élégant|raffin|haut de gamme/.test(t)) return 'ELEGANT';
    if (/artisan|rustic|rustique|authentique|traditionnel|chaleureux|terroir/.test(t)) return 'RUSTIC';
    if (/minimal|epure|épuré|sobre|clean/.test(t)) return 'MINIMAL';
    if (/bold|audacieux|energique|énergique|dynamique|punchy/.test(t)) return 'BOLD';
    if (/classique|classic|intemporel|institutionnel/.test(t)) return 'CLASSIC';
    return 'MODERN';
  }
}
