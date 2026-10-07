import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { BrandAssetService } from '../../common/brand-kit/brand-asset.service';
import { renderBrandContext, resolveBrandContext } from '../../common/ai/brand-context';
import {
  HONESTY_RULES,
  NO_PREAMBLE,
  SAMPLING,
  VOICE_RULES,
  languageName,
} from '../../common/ai/prompt-rules';
import { absoluteAssetUrl } from '../../common/app-url';
import { GenerateContentDto, UpdateContentDto } from './content.dto';
import { ContentType, ContentLength, ContentStatus } from '@prisma/client';

/**
 * What each content type looks like. The type used to be stored and never
 * sent to the model, so a slogan and a blog article got the same prompt and
 * differed only in their token budget.
 */
const FORMAT_SPEC: Record<string, string> = {
  POST:
    'A social post of 40 to 90 words. The first line is a hook that stands on its own. ' +
    'At most one emoji, only if natural. End with the given hashtags, or 2 to 4 relevant ones.',
  AD:
    'Three lines, exactly:\nTitre: at most 40 characters\nTexte: at most 125 characters\nCTA: 2 to 4 words',
  EMAIL:
    'Objet: at most 50 characters\nPre-en-tete: at most 90 characters\n' +
    'Then the body: 80 to 150 words, one single call to action, no emoji.',
  BLOG:
    'Markdown article: one "# " title, 3 to 5 "## " sections, 400 to 800 words. No emoji.',
  SLOGAN: 'Five slogan options, 3 to 8 words each, one per line, no numbering, no final punctuation.',
  DESCRIPTION: 'One descriptive paragraph of 50 to 90 words, no call to action, no emoji.',
};

/** Sector-specific emphasis, moved here from the web form so every client gets it. */
const SECTOR_GUIDANCE: Record<string, string> = {
  RESTAURANT: 'Lead with the food and the reason to book; name dishes, not adjectives.',
  CAFE: 'Sell a moment and a place, then the drink or pastry that goes with it.',
  RETAIL: 'Put the benefit to the customer before technical details.',
  EVENT: 'Date, place and how to register must be unmistakable — only if they are in the data.',
  REAL_ESTATE: 'Stay factual: location, surface, strengths and next step.',
  HEALTH: 'Reassuring and factual; never promise a medical result.',
  EDUCATION: 'Say who it is for, what they will be able to do, and how to enrol.',
  SERVICES: 'Start from the client problem, explain the method, end on one simple action.',
};

function contentSystemPrompt(language: string, tone: string): string {
  return `You write marketing content for a real small business described in <brand_context>.

${HONESTY_RULES}

${VOICE_RULES}

Write in ${languageName(language)}, in a ${tone} tone.
Follow <format> exactly.
${NO_PREAMBLE}`;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly brandKit: BrandKitService,
    private readonly brandAssets: BrandAssetService,
  ) {}

  async generateContent(userId: string, tenantId: string, dto: GenerateContentDto) {
    const kit = await this.brandKit.find(tenantId);
    const type = (dto.type || 'POST').toUpperCase();
    const topic = (dto.topic || dto.prompt || '').trim();

    const ctx = resolveBrandContext(kit, {
      businessType: dto.businessType,
      targetAudience: dto.targetAudience,
      tone: dto.tone,
      language: dto.language,
    });

    // Posts and ads get a picture; the copywriter, who knows what the text is
    // about, names what it shows. Taking the first 200 characters of the
    // prompt used to hand the image model the form's own labels.
    const wantsImageSubject = Boolean(dto.generateImage);

    const request = [
      renderBrandContext(ctx, { includeContacts: type === 'EMAIL' || type === 'AD' }),
      '',
      '<request>',
      `Content type: ${type}`,
      `Objective: ${dto.objective?.trim() || 'not given: inform without pushing a sale'}`,
      `Subject: ${topic}`,
      SECTOR_GUIDANCE[String(ctx.businessType).toUpperCase()]
        ? `Sector guidance: ${SECTOR_GUIDANCE[String(ctx.businessType).toUpperCase()]}`
        : '',
      dto.keywords?.length ? `Keywords to work in naturally: ${dto.keywords.join(', ')}` : '',
      dto.callToAction?.trim()
        ? `Call to action, use as written: ${dto.callToAction.trim()}`
        : 'Call to action: none given. End on a plain invitation tied to the offer, never a promotion.',
      '</request>',
      '',
      `<format>\n${FORMAT_SPEC[type] || FORMAT_SPEC.POST}\n</format>`,
      // When the owner has said what the picture shows, the copy is written
      // against it: a post describing something other than the photograph
      // beside it reads as two unrelated things.
      dto.imageBrief?.trim()
        ? `\nThe picture published with this text shows: ${dto.imageBrief.trim()}. ` +
          'Write the text so it works with that picture, and never describe the picture in words.'
        : '',
      wantsImageSubject && !dto.imageBrief?.trim()
        ? '\nAfter the content, on its own last line, write "IMAGE_SUBJECT: " followed by one English sentence ' +
          'describing what a matching photograph shows (subject, setting, action; no style, no text, no brand name).'
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n');

    const raw = await this.aiEngine.generateText(
      {
        prompt: request,
        length: dto.length,
        temperature: SAMPLING.creative,
      },
      undefined,
      contentSystemPrompt(ctx.language, ctx.tone),
    );

    const split = this.splitImageSubject(raw);
    const imageSubject = split.imageSubject;
    const generatedText = await this.aiEngine.enforceVoice(split.body, ctx.language);

    // Generate a matching image if the user requested it, through the brand's
    // art direction so it looks like the rest of the brand's visuals.
    let imageUrl: string | null = null;
    if (dto.generateImage) {
      try {
        const direction = this.brandKit.direction(tenantId, kit, [
          kit?.colors.primary || '',
          kit?.colors.secondary || '',
          kit?.colors.accent || '',
        ]);
        // The owner's choices win over the defaults: they know whether this
        // post wants the dish, the shop or someone at work, and whether it is
        // going out as a square feed post or a vertical story.
        const written = imageSubject || `${topic.slice(0, 160)}, at a ${ctx.businessType || 'local business'}`;
        const asked = dto.imageBrief?.trim();
        imageUrl = await this.brandAssets.render(
          direction,
          {
            kind: dto.imageKind || (type === 'AD' ? 'product' : 'lifestyle'),
            aspect: dto.imageFormat || 'square',
            subject: asked || written,
            // A brief written by hand can trip the provider's filter; the
            // copywriter's own sentence is the safety net.
            fallbackSubject: asked ? written : undefined,
          },
          `t-${tenantId}`,
        );
        // Absolute, like uploaded images: the client renders it on its own origin.
        if (imageUrl) imageUrl = absoluteAssetUrl(imageUrl) || imageUrl;
        if (imageUrl) this.logger.log(`Image generated for content "${topic.slice(0, 40)}"`);
      } catch (err: any) {
        this.logger.warn(`Image generation failed for content: ${err.message}`);
        // Content is still valid without image — continue
      }
    }

    return this.prisma.content.create({
      data: {
        title: dto.title,
        body: generatedText,
        type: (type as ContentType) || ContentType.POST,
        tone: ctx.tone,
        length: (dto.length?.toUpperCase() as ContentLength) || ContentLength.MEDIUM,
        status: ContentStatus.GENERATED,
        prompt: topic,
        imageUrl,
        tenantId,
        userId,
      },
    });
  }

  /** Pull the trailing "IMAGE_SUBJECT:" line out of the copy. */
  private splitImageSubject(raw: string): { body: string; imageSubject: string | null } {
    const match = raw.match(/\n?\s*IMAGE_SUBJECT\s*:\s*(.+)\s*$/i);
    if (!match) return { body: raw.trim(), imageSubject: null };
    return {
      body: raw.slice(0, match.index).trim(),
      imageSubject: match[1].trim().replace(/^["']|["']$/g, '') || null,
    };
  }

  async findAll(tenantId: string) {
    return this.prisma.content.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id, tenantId },
    });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }

  async update(id: string, tenantId: string, dto: UpdateContentDto) {
    await this.findOne(id, tenantId);
    return this.prisma.content.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        status: dto.status as ContentStatus,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.content.delete({ where: { id } });
  }
}
