import { BrandKit } from '../brand-kit/brand-kit.service';
import { languageName } from './prompt-rules';

/**
 * The one description of the business every generator writes from.
 *
 * Each module used to hand the model its own subset: posts got the name and a
 * 400-character description, the menu never saw the tone, only the site knew
 * the audience, and nothing ever saw the tagline. The same business came out
 * as a different business in every channel. Now every prompt embeds this
 * block, so the site, the posts, the posters and the reels make the same
 * promise in the same voice.
 *
 * Empty fields are left out rather than written as "not specified", which
 * reads to a model as an invitation to fill the gap.
 */
export interface BrandContextInput {
  businessName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  description?: string | null;
  services?: string[] | null;
  targetAudience?: string | null;
  tone?: string | null;
  language?: string | null;
  currency?: string | null;
}

export interface ResolvedBrandContext {
  businessName: string;
  businessType: string;
  industry: string;
  description: string;
  services: string[];
  targetAudience: string;
  tone: string;
  language: string;
  currency: string;
  tagline: string;
  messagingAngle: string;
  voice: string;
  personality: string;
  visualStyle: string;
  contacts: string[];
}

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();

/** Explicit input wins; the kit fills the gaps. */
export function resolveBrandContext(
  kit: BrandKit | null,
  input: BrandContextInput = {},
): ResolvedBrandContext {
  const services = (input.services?.length ? input.services : kit?.business.services || [])
    .map(clean)
    .filter(Boolean);
  const businessType = clean(input.businessType) || clean(kit?.business.businessType);
  return {
    businessName: clean(input.businessName) || clean(kit?.name),
    businessType: businessType === 'OTHER' ? '' : businessType,
    industry: clean(input.industry) || clean(kit?.industry),
    description: clean(input.description) || clean(kit?.business.description),
    services,
    targetAudience: clean(input.targetAudience) || clean(kit?.targetAudience),
    tone: clean(input.tone) || clean(kit?.tone) || 'professional',
    language: clean(input.language) || clean(kit?.business.language) || 'fr',
    currency: clean(input.currency) || clean(kit?.business.currency) || 'EUR',
    tagline: clean(kit?.tagline),
    messagingAngle: clean(kit?.platform.messagingAngle),
    voice: clean(kit?.platform.voice),
    personality: clean(kit?.platform.personality),
    visualStyle: clean(kit?.style),
    contacts: [
      kit?.business.contactPhone,
      kit?.business.contactEmail,
      kit?.business.contactAddress,
      kit?.business.website,
    ]
      .map(clean)
      .filter(Boolean),
  };
}

/** The `<brand_context>` block, identical in shape for every generator. */
export function renderBrandContext(
  ctx: ResolvedBrandContext,
  options: { includeContacts?: boolean; maxDescription?: number } = {},
): string {
  const description =
    options.maxDescription && ctx.description.length > options.maxDescription
      ? `${ctx.description.slice(0, options.maxDescription).trim()}…`
      : ctx.description;

  const lines = [
    ctx.businessName && `Business: ${ctx.businessName}`,
    ctx.businessType && `Type: ${ctx.businessType}`,
    ctx.industry && `Sector: ${ctx.industry}`,
    description && `What it does: ${description}`,
    ctx.services.length && `Offer (use these exact names): ${ctx.services.join(', ')}`,
    ctx.targetAudience && `Audience: ${ctx.targetAudience}`,
    `Tone of voice: ${ctx.tone}${ctx.voice ? ` — ${ctx.voice}` : ''}`,
    ctx.personality && `Personality: ${ctx.personality}`,
    ctx.tagline && `Tagline (reuse verbatim when a tagline fits): ${ctx.tagline}`,
    ctx.messagingAngle && `Brand promise: ${ctx.messagingAngle}`,
    `Language: ${languageName(ctx.language)}`,
    options.includeContacts && ctx.contacts.length && `Public contact details: ${ctx.contacts.join(' · ')}`,
  ].filter(Boolean);

  return `<brand_context>\n${lines.join('\n')}\n</brand_context>\nAny field absent above is unknown. Never fill it in.`;
}
