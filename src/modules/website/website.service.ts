import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { BusinessContextService } from '../business-context/business-context.service';
import { VercelDeploymentService } from './vercel-deployment.service';
import { WebsiteRendererService } from './website-renderer.service';
import { buildContent, BuildInput, normalizeSection } from './website-content.builder';
import { getPath, setPath } from './content-path.util';
import { WebsiteContent, Section } from './website-content.types';
import { SiteBlueprint, planSite } from './website-blueprint';
import { BrandAssetService, ShotSpec } from '../../common/brand-kit/brand-asset.service';
import { BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { buildArtDirection } from '../../common/brand-kit/art-direction';

export interface ProductDto {
  name: string;
  price: string;
  imageUrl?: string;
  imagePrompt?: string;
  description?: string;
}

export interface WebsiteGenerationDto {
  // Optional: resolved from the tenant's business context when omitted.
  businessName?: string;
  businessType?: string;
  description?: string;
  services?: string[];
  products?: ProductDto[];
  gallery?: { enabled?: boolean; images?: { imageUrl?: string; imagePrompt?: string }[] };
  context?: string;
  /** Real reviews from the owner; the only ones the site may show. */
  testimonials?: { quote: string; author?: string; role?: string }[];
  contactInfo?: {
    phone?: string;
    email?: string;
    address?: string;
    whatsapp?: string;
    googleReviewUrl?: string;
    googleMapsUrl?: string;
    hours?: string;
    mapQuery?: string;
  };
  colors?: { primary?: string; secondary?: string; accent?: string };
  fontFamily?: string;
  language?: 'fr' | 'en' | 'es' | 'ar' | 'de';
  currency?: string;
  template?: 'modern' | 'classic' | 'minimal' | 'bold';
  logoUrl?: string;
}

@Injectable()
export class WebsiteService {
  private readonly logger = new Logger(WebsiteService.name);

  constructor(
    private readonly aiEngineService: AiEngineService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly renderer: WebsiteRendererService,
    private readonly vercelDeploymentService: VercelDeploymentService,
    private readonly businessContext: BusinessContextService,
    private readonly brandAssets: BrandAssetService,
    private readonly brandKit: BrandKitService,
  ) {}

  // ---------- create ----------

  async generateWebsite(rawDto: WebsiteGenerationDto, tenantId: string, userId: string) {
    if (!tenantId || !userId) {
      throw new BadRequestException('Missing tenant or user context');
    }

    // Anything the form left blank comes from the tenant's business context.
    const dto = await this.businessContext.resolve(tenantId, rawDto);
    const context = await this.businessContext.find(tenantId);
    if (!dto.businessName) {
      throw new BadRequestException(
        "Nom du commerce manquant. Renseignez votre contexte business dans les paramètres.",
      );
    }

    const products = dto.products || [];
    const language = dto.language || context?.language || 'fr';

    // Resolve the pasted Google Maps URL into an embeddable location.
    const contact = {
      phone: context?.contactPhone || undefined,
      email: context?.contactEmail || undefined,
      address: context?.contactAddress || undefined,
      ...(dto.contactInfo || {}),
    };
    if (contact.googleMapsUrl) {
      const resolved = await this.resolveMapFromUrl(contact.googleMapsUrl);
      if (resolved.mapQuery) contact.mapQuery = resolved.mapQuery;
      if (!contact.address && resolved.address) contact.address = resolved.address;
    }

    const input: BuildInput = {
      businessName: dto.businessName,
      businessType: dto.businessType,
      description: dto.description,
      services: dto.services,
      products,
      gallery: dto.gallery,
      context: dto.context,
      contact,
      colors: dto.colors,
      fontFamily: dto.fontFamily,
      template: dto.template,
      logoUrl: dto.logoUrl,
      language,
      currency: dto.currency || context?.currency,
    };

    // Tone and audience come from the business context, not from an arbitrary
    // generated brand kit (a tenant accumulates one per branding generation).
    input.tone = context?.tone || 'professional';
    input.targetAudience = context?.targetAudience || undefined;

    // Decide the architecture BEFORE writing a word. A restaurant gets a menu
    // and a gallery; a law firm gets practice areas and a first-meeting
    // section. Same generator, different object.
    const blueprint = planSite({
      businessType: dto.businessType,
      description: dto.description,
      hasProducts: products.length > 0,
      hasGallery: dto.gallery?.enabled !== false,
      template: dto.template,
    });
    this.logger.log(
      `Blueprint: ${blueprint.category} (${blueprint.label}) — ` +
        `${blueprint.sections.length} sections [${blueprint.sections.map((x) => x.role).join(', ')}]`,
    );

    // The blueprint also sets the look, unless the user picked one explicitly.
    input.template = (dto.template || this.templateFor(blueprint)) as any;
    // The tenant's own identity wins over the per-trade default, so a site
    // generated after a branding run is not a different brand from its logo.
    const kit = await this.brandKit.find(tenantId);
    input.colors = this.brandKit.apply(dto.colors || {}, kit, blueprint.palette);
    if (!dto.logoUrl && kit?.logoUrl) input.logoUrl = kit.logoUrl;
    if (!dto.fontFamily && kit?.fonts.body) input.fontFamily = kit.fonts.body;

    let ai: any = undefined;
    try {
      ai = await this.aiEngineService.generateWebsiteContentJson({
        businessName: input.businessName,
        businessType: input.businessType,
        description: input.description,
        services: input.services,
        targetAudience: input.targetAudience,
        tone: input.tone,
        language: input.language,
        currency: input.currency,
        context: input.context,
        category: blueprint.label,
        primaryAction: blueprint.primaryAction,
        products,
        testimonials: dto.testimonials,
        kit,
        blueprint: blueprint.sections.map((x) => ({
          type: x.type,
          role: x.role,
          brief: x.brief,
        })),
      });
    } catch (err: any) {
      this.logger.error(`AI website content generation failed: ${err.message}`);
      throw new BadRequestException(
        `La génération IA du site web a échoué. Aucun site par défaut n'a été créé; veuillez réessayer. Détail: ${err.message}`,
      );
    }

    const content = buildContent(input, ai);
    this.hideEmptySections(content);
    // Fill every empty image slot (hero, about, gallery, products, custom) with AI.
    // Pass rich business context so images match the actual business, not a
    // generic (and often wrong) interpretation of just the category.
    content.theme.heroStyle = content.theme.heroStyle || blueprint.heroStyle;
    content.theme.density = content.theme.density || blueprint.density;
    // Photography is deferred: a site needs a hero plus section and product
    // shots at ~50s each, and generating them inline pushed the request past
    // every HTTP client's header timeout.
    const html = this.renderer.render(content);
    const subdomain = this.generateSubdomain(dto.businessName);

    const website = await this.prisma.website.create({
      data: {
        businessName: dto.businessName,
        businessType: dto.businessType,
        description: dto.description,
        services: dto.services || [],
        contactPhone: dto.contactInfo?.phone,
        contactEmail: dto.contactInfo?.email,
        contactAddress: dto.contactInfo?.address,
        primaryColor: content.theme.primaryColor,
        secondaryColor: content.theme.secondaryColor,
        accentColor: content.theme.accentColor,
        fontFamily: content.theme.fontFamily,
        template: content.theme.template,
        logoUrl: content.logo.type === 'image' ? content.logo.imageUrl : null,
        logoText: content.logo.text,
        content: content as any,
        html,
        css: '',
        subdomain,
        status: 'DRAFT',
        deploymentStatus: 'NONE',
        visualStatus: 'PENDING',
        tenantId,
        userId,
      },
    });

    void this.renderWebsiteVisuals(website.id, blueprint, dto);

    return { ...this.toResponse(website), visualStatus: 'RENDERING' };
  }

  /**
   * Render the site's photography in the background, then recompile the HTML.
   *
   * `visualStatus` is what the client polls; PARTIAL means some slots could
   * not be produced and the layout was closed up around them rather than left
   * with holes.
   */
  async renderWebsiteVisuals(
    id: string,
    blueprint: SiteBlueprint,
    dto: WebsiteGenerationDto,
  ): Promise<void> {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) return;

    await this.prisma.website.update({ where: { id }, data: { visualStatus: 'RENDERING' } });
    try {
      const content = this.content(website);
      const outcome = await this.generateContentImages(
        content,
        blueprint,
        dto,
        `t-${website.tenantId}`,
      );
      await this.prisma.website.update({
        where: { id },
        data: {
          content: content as any,
          html: this.renderer.render(content),
          visualStatus:
            outcome.total === 0
              ? 'READY'
              : outcome.rendered === 0
                ? 'FAILED'
                : outcome.rendered < outcome.total
                  ? 'PARTIAL'
                  : 'READY',
        },
      });
    } catch (error: any) {
      this.logger.error(`Website visual rendering failed: ${error?.message}`);
      await this.prisma.website
        .update({ where: { id }, data: { visualStatus: 'FAILED' } })
        .catch(() => undefined);
    }
  }

  /** Re-run (or finish) a site's photography without regenerating its copy. */
  async refreshWebsiteVisuals(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    const blueprint = planSite({
      businessType: website.businessType,
      description: website.description,
      hasProducts: (this.content(website).sections || []).some((x) => x.type === 'products'),
    });
    void this.renderWebsiteVisuals(id, blueprint, {
      businessName: website.businessName,
      businessType: website.businessType,
      description: website.description,
    });
    return { visualStatus: 'RENDERING' };
  }

  /**
   * Photograph the site.
   *
   * Every shot goes through the brand's single art direction, so the hero, the
   * team portrait and the six product packs look like one commission rather
   * than six unrelated stock images. Subjects come from the blueprint when the
   * copywriter did not supply one.
   */
  private async generateContentImages(
    content: WebsiteContent,
    blueprint: SiteBlueprint,
    dto: WebsiteGenerationDto,
    scope: string,
  ): Promise<{ rendered: number; total: number }> {
    const kit = await this.brandKit.find(scope.replace(/^t-/, ''));
    const direction = buildArtDirection({
      brandKey: `${scope}:${kit?.name || dto.businessName}`,
      style: kit?.style || blueprint.visualStyle,
      colors: [
        content.theme.primaryColor,
        content.theme.secondaryColor,
        content.theme.accentColor,
      ],
    });

    const setting = [dto.businessType, (dto.description || '').slice(0, 100)]
      .filter(Boolean)
      .join(', ');
    const place = `a ${blueprint.label.toLowerCase()} business${setting ? ` (${setting})` : ''}`;
    const briefFor = (role: string) =>
      blueprint.sections.find((x) => x.role === role)?.shots?.[0];

    const tasks: { spec: ShotSpec; assign: (url: string) => void }[] = [];

    for (const section of content.sections) {
      const d: any = section.data || {};
      const planned = briefFor(d.role);

      if (['hero', 'about', 'custom'].includes(section.type) && !d.imageUrl) {
        // A text-only section in the blueprint carries no shot plan, and
        // inventing one for it is how sites end up padded with stock imagery.
        if (section.type === 'hero' || planned) {
          tasks.push({
            spec: {
              kind: planned?.kind || (section.type === 'hero' ? 'hero' : 'interior'),
              aspect: section.type === 'hero' ? 'wide' : 'landscape',
              subject: d.imagePrompt || planned?.subject || place,
              fallbackSubject: planned?.subject,
            },
            assign: (u) => (d.imageUrl = u),
          });
        }
      }

      if (section.type === 'gallery') {
        const wanted = planned?.count || 3;
        d.images = Array.isArray(d.images) ? d.images : [];
        for (let i = 0; i < wanted; i += 1) {
          if (d.images[i]) continue;
          const index = i;
          tasks.push({
            spec: {
              kind: planned?.kind || 'detail',
              aspect: 'landscape',
              subject: d.imagePrompts?.[index] || planned?.subject || place,
              fallbackSubject: planned?.subject,
            },
            assign: (u) => (d.images[index] = u),
          });
        }
      }

      if ((section.type === 'products' || d.role === 'menu-highlights') && Array.isArray(d.items)) {
        for (const item of d.items) {
          if (item.imageUrl || !item?.name) continue;
          tasks.push({
            spec: {
              kind: planned?.kind || 'product',
              aspect: 'landscape',
              subject:
                item.imagePrompt ||
                `${item.name}${item.description ? `, ${item.description}` : ''}, from ${place}`,
              // The owner's product name can itself trip the provider's filter.
              fallbackSubject: planned?.subject || 'a single product on a clean surface',
            },
            assign: (u) => (item.imageUrl = u),
          });
        }
      }
    }

    if (!tasks.length) return { rendered: 0, total: 0 };
    this.logger.log(`Rendu de ${tasks.length} visuel(s) pour ${dto.businessName}`);

    const shots = await this.brandAssets.renderAll(
      direction,
      tasks.map((t) => t.spec),
      scope,
    );
    shots.forEach((shot, i) => {
      if (shot.url) tasks[i].assign(shot.url);
    });

    // A gallery that only half-filled would render holes.
    for (const section of content.sections) {
      if (section.type !== 'gallery') continue;
      const d: any = section.data || {};
      d.images = (d.images || []).filter(Boolean);
      if (!d.images.length) section.visible = false;
    }

    const rendered = shots.filter((x) => x.url).length;
    this.logger.log(`Visuels: ${rendered}/${tasks.length}`);
    return { rendered, total: tasks.length };
  }

  /** The blueprint's visual style, expressed as a renderer template. */
  private templateFor(blueprint: SiteBlueprint): string {
    const map: Record<string, string> = {
      MODERN: 'modern',
      MINIMAL: 'minimal',
      BOLD: 'bold',
      CLASSIC: 'classic',
      ELEGANT: 'classic',
      RUSTIC: 'classic',
    };
    return map[blueprint.visualStyle] || 'modern';
  }

  // ---------- read (ownership-checked) ----------

  async listWebsites(tenantId: string) {
    const websites = await this.prisma.website.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return websites.map((w) => this.toSummary(w));
  }

  async getWebsite(id: string, tenantId: string) {
    return this.toResponse(await this.owned(id, tenantId));
  }

  async getWebsiteBySubdomain(subdomain: string) {
    const website = await this.prisma.website.findUnique({ where: { subdomain } });
    if (!website || website.status !== 'PUBLISHED') {
      throw new NotFoundException('Website not found or not published');
    }
    return {
      id: website.id,
      html: website.html,
      subdomain: website.subdomain,
      businessName: website.businessName,
      status: website.status,
    };
  }

  // ---------- edit: text ----------

  async updateText(id: string, tenantId: string, path: string, value: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    if (typeof value !== 'string') throw new BadRequestException('value must be a string');
    if (!setPath(content, path, value)) {
      throw new BadRequestException(`Path not editable: ${path}`);
    }
    return this.persist(id, content);
  }

  // ---------- edit: images (upload or AI-generated) ----------

  /** Set an image slot from an already-stored URL (used after multipart upload). */
  async setImageUrl(id: string, tenantId: string, path: string, url: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    this.applyImage(content, path, url);
    return this.persist(id, content);
  }

  /**
   * Generate an image with AI for a given slot.
   *
   * Goes through the brand's art direction like every other site image. It
   * used to send the raw slot prompt — or, failing that, the site's TITLE —
   * straight to the image model: no palette, no brand seed, a square crop for
   * a wide hero, lettering from the title, and a base64 blob in the content.
   */
  async generateImageForSlot(id: string, tenantId: string, path: string, prompt?: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const kit = await this.brandKit.find(tenantId);
    const direction = buildArtDirection({
      brandKey: `t-${tenantId}:${kit?.name || website.businessName}`,
      style: kit?.style,
      colors: [
        content.theme.primaryColor,
        content.theme.secondaryColor,
        content.theme.accentColor,
      ],
    });

    const place = [website.businessType, (website.description || '').slice(0, 100)]
      .filter(Boolean)
      .join(', ');
    const subject =
      prompt?.trim() ||
      String(getPath(content, path.replace(/\.imageUrl$/, '.imagePrompt')) || '').trim() ||
      `the place and work of a ${place || 'local business'}`;

    // Sections are addressed by id (sections.<uuid>.data.imageUrl) or index.
    const sectionKey = /^sections\.([^.]+)\.data\.imageUrl$/.exec(path)?.[1];
    const isHero =
      !!sectionKey &&
      content.sections.find((x, i) => x.id === sectionKey || String(i) === sectionKey)?.type ===
        'hero';
    const isLogo = path === 'logo.imageUrl';

    const url = await this.brandAssets.render(
      direction,
      {
        kind: isHero ? 'hero' : /\.items\./.test(path) ? 'product' : 'detail',
        aspect: isLogo ? 'square' : isHero ? 'wide' : 'landscape',
        subject,
      },
      `t-${tenantId}`,
    );
    if (!url) {
      throw new BadRequestException("L'image n'a pas pu etre generee. Veuillez reessayer.");
    }
    this.applyImage(content, path, url);
    return this.persist(id, content);
  }

  private applyImage(content: WebsiteContent, path: string, url: string) {
    if (path === 'logo.imageUrl') {
      content.logo = { type: 'image', imageUrl: url, text: content.logo.text };
      return;
    }
    if (!setPath(content, path, url)) {
      throw new BadRequestException(`Path not editable: ${path}`);
    }
  }

  /** Remove the logo image and fall back to a generated wordmark. */
  async resetLogoToWordmark(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    content.logo = { type: 'wordmark', text: content.logo.text || website.businessName };
    return this.persist(id, content);
  }

  // ---------- theme ----------

  async updateTheme(id: string, tenantId: string, theme: Partial<WebsiteContent['theme']>) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    content.theme = { ...content.theme, ...theme };
    return this.persistTheme(id, content);
  }

  /** AI design assistant: apply a free-text instruction to the theme only. */
  async applyDesignInstruction(id: string, tenantId: string, instruction: string) {
    if (!instruction?.trim()) throw new BadRequestException('Describe the change you want');
    const website = await this.owned(id, tenantId);
    const content = this.content(website);

    let patch: any;
    try {
      const kit = await this.brandKit.find(tenantId);
      patch = await this.aiEngineService.generateThemePatch(instruction, content.theme, {
        primary: kit?.colors.primary,
        secondary: kit?.colors.secondary,
        accent: kit?.colors.accent,
        fonts: kit ? [kit.fonts.heading, kit.fonts.body] : [],
      });
    } catch (err: any) {
      throw new BadRequestException(`Design assistant failed: ${err.message}`);
    }
    content.theme = { ...content.theme, ...this.sanitizeThemePatch(patch) };
    return this.persistTheme(id, content);
  }

  /** Whitelist + validate an LLM-produced theme patch. */
  private sanitizeThemePatch(patch: any): Partial<WebsiteContent['theme']> {
    const out: any = {};
    if (!patch || typeof patch !== 'object') return out;
    const inSet = (v: any, set: string[]) => (set.includes(v) ? v : undefined);
    const hex = (v: any) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
    const map: Record<string, (v: any) => any> = {
      radius: (v) => inSet(v, ['none', 'small', 'medium', 'large', 'full']),
      buttonStyle: (v) => inSet(v, ['pill', 'rounded', 'square']),
      density: (v) => inSet(v, ['compact', 'normal', 'spacious']),
      template: (v) => inSet(v, ['modern', 'classic', 'minimal', 'bold']),
      fontFamily: (v) => inSet(v, ['Inter', 'Poppins', 'Montserrat', 'Playfair Display', 'Roboto', 'Lora']),
      animations: (v) => (typeof v === 'boolean' ? v : undefined),
      primaryColor: hex,
      secondaryColor: hex,
      accentColor: hex,
    };
    for (const [k, fn] of Object.entries(map)) {
      const v = fn(patch[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  private persistTheme(id: string, content: WebsiteContent) {
    return this.persist(id, content, {
      primaryColor: content.theme.primaryColor,
      secondaryColor: content.theme.secondaryColor,
      accentColor: content.theme.accentColor,
      fontFamily: content.theme.fontFamily,
      template: content.theme.template,
    });
  }

  // ---------- sections: add / delete / reorder / toggle ----------

  async addSection(id: string, tenantId: string, request: string) {
    if (!request?.trim()) throw new BadRequestException('Describe the section to add');
    const website = await this.owned(id, tenantId);
    const content = this.content(website);

    let raw: any;
    try {
      raw = await this.aiEngineService.generateSectionJson({
        request,
        businessName: website.businessName,
        businessType: website.businessType,
        description: website.description,
        language: content.meta.language,
        existingSections: this.headings(content),
        kit: await this.brandKit.find(tenantId),
      });
    } catch (err: any) {
      this.logger.error(`Section generation failed: ${err.message}`);
      throw new BadRequestException(
        `La génération IA de la section a échoué. Aucune section par défaut n'a été créée; veuillez réessayer. Détail: ${err.message}`,
      );
    }
    const section = normalizeSection(raw);
    if (!section) throw new BadRequestException('Could not build section');
    section.data.request = request; // remembered for later regeneration

    // Insert before the contact section if present, else append.
    const contactIdx = content.sections.findIndex((s) => s.type === 'contact');
    if (contactIdx >= 0) content.sections.splice(contactIdx, 0, section);
    else content.sections.push(section);

    return this.persist(id, content);
  }

  async deleteSection(id: string, tenantId: string, sectionId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const before = content.sections.length;
    content.sections = content.sections.filter((s) => s.id !== sectionId);
    if (content.sections.length === before) throw new NotFoundException('Section not found');
    return this.persist(id, content);
  }

  async reorderSections(id: string, tenantId: string, order: string[]) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const map = new Map(content.sections.map((s) => [s.id, s]));
    const reordered = order.map((sid) => map.get(sid)).filter((s): s is Section => !!s);
    for (const s of content.sections) if (!order.includes(s.id)) reordered.push(s);
    content.sections = reordered;
    return this.persist(id, content);
  }

  /** Add a blank item (name/description/price/image) to a section's list. */
  async addItem(id: string, tenantId: string, sectionId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    if (!Array.isArray(section.data.items)) section.data.items = [];
    section.data.items.push({ name: 'Nouvel élément', description: '', price: '', imageUrl: '' });
    return this.persist(id, content);
  }

  async removeItem(id: string, tenantId: string, sectionId: string, index: number) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section || !Array.isArray(section.data.items)) throw new NotFoundException('Section/items not found');
    if (index < 0 || index >= section.data.items.length) throw new BadRequestException('Invalid item index');
    section.data.items.splice(index, 1);
    return this.persist(id, content);
  }

  /** Add an empty image slot to a gallery section. */
  async addGalleryImage(id: string, tenantId: string, sectionId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    if (!Array.isArray(section.data.images)) section.data.images = [];
    section.data.images.push('');
    return this.persist(id, content);
  }

  async toggleSection(id: string, tenantId: string, sectionId: string, visible: boolean) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    section.visible = visible;
    return this.persist(id, content);
  }

  // ---------- regenerate ----------

  /**
   * Fresh copy for the whole site.
   *
   * Regeneration used to call the copywriter without the blueprint, the trade
   * category or the primary action, so it fell back to seven generic sections
   * and a "get in touch" CTA: regenerating a restaurant site made it worse.
   * It now re-plans the site exactly as creation does.
   */
  async regenerateAll(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const context = await this.businessContext.find(tenantId);
    const kit = await this.brandKit.find(tenantId);
    const products = this.productsOf(content);
    const blueprint = planSite({
      businessType: website.businessType,
      description: website.description,
      hasProducts: products.length > 0,
    });

    let ai: any;
    try {
      ai = await this.aiEngineService.generateWebsiteContentJson({
        businessName: website.businessName,
        businessType: website.businessType,
        description: website.description,
        services: website.services,
        targetAudience: context?.targetAudience || undefined,
        tone: context?.tone || 'professional',
        language: content.meta.language,
        currency: content.currency,
        category: blueprint.label,
        primaryAction: blueprint.primaryAction,
        products,
        testimonials: this.testimonialsOf(content),
        kit,
        blueprint: blueprint.sections.map((x) => ({ type: x.type, role: x.role, brief: x.brief })),
      });
    } catch (err: any) {
      throw new BadRequestException(`Regeneration failed: ${err.message}`);
    }

    // Fresh copy, but preserve the user's theme, logo and contact choices.
    const rebuilt = buildContent(
      {
        businessName: website.businessName,
        businessType: website.businessType,
        description: website.description,
        services: website.services,
        colors: {
          primary: content.theme.primaryColor,
          secondary: content.theme.secondaryColor,
          accent: content.theme.accentColor,
        },
        fontFamily: content.theme.fontFamily,
        template: content.theme.template,
        language: content.meta.language,
        currency: content.currency,
      },
      ai,
    );
    rebuilt.logo = content.logo;
    rebuilt.contact = content.contact;
    rebuilt.theme = { ...rebuilt.theme, ...content.theme };
    this.hideEmptySections(rebuilt);
    return this.persist(id, rebuilt);
  }

  /**
   * Fresh copy for one section only.
   *
   * This used to regenerate the entire site and keep one section of it:
   * N sections' worth of tokens for one, written without the blueprint and
   * without knowing what the rest of the page said.
   */
  async regenerateSection(id: string, tenantId: string, sectionId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    const kit = await this.brandKit.find(tenantId);
    const others = this.headings(content).filter((_, i) => content.sections[i]?.id !== sectionId);

    try {
      if (section.type === 'custom') {
        const raw = await this.aiEngineService.generateSectionJson({
          request: section.data.request || section.data.heading || 'section',
          businessName: website.businessName,
          businessType: website.businessType,
          description: website.description,
          language: content.meta.language,
          existingSections: others,
          kit,
        });
        const fresh = normalizeSection(raw);
        if (fresh) section.data = { ...fresh.data, request: section.data.request };
      } else {
        const context = await this.businessContext.find(tenantId);
        const products = this.productsOf(content);
        const blueprint = planSite({
          businessType: website.businessType,
          description: website.description,
          hasProducts: products.length > 0,
        });
        const role = section.data.role || section.type;
        const slot = blueprint.sections.find((x) => x.role === role) ||
          blueprint.sections.find((x) => x.type === section.type) || {
            type: section.type,
            role,
            brief: '',
          };

        const ai = await this.aiEngineService.generateWebsiteContentJson({
          businessName: website.businessName,
          businessType: website.businessType,
          description: website.description,
          services: website.services,
          targetAudience: context?.targetAudience || undefined,
          tone: context?.tone || 'professional',
          language: content.meta.language,
          currency: content.currency,
          category: blueprint.label,
          primaryAction: blueprint.primaryAction,
          products,
          testimonials: this.testimonialsOf(content),
          existingSections: others,
          kit,
          blueprint: [{ type: slot.type, role: slot.role, brief: slot.brief }],
        });
        const match = (ai?.sections || [])[0];
        if (match?.data) {
          const fresh = normalizeSection(match);
          const keepImages = this.pickImages(section.data);
          section.data = { ...(fresh?.data || match.data), role: section.data.role, ...keepImages };
        }
      }
    } catch (err: any) {
      throw new BadRequestException(`Section regeneration failed: ${err.message}`);
    }
    return this.persist(id, content);
  }

  /** "type: heading" for every section, in page order. */
  private headings(content: WebsiteContent): { type: string; heading?: string }[] {
    return content.sections.map((s) => ({
      type: s.type,
      heading: String(s.data?.heading || s.data?.title || '').slice(0, 120),
    }));
  }

  /** The owner's products, with the prices they set, as currently on the page. */
  private productsOf(content: WebsiteContent): { name: string; price?: string; description?: string }[] {
    return content.sections
      .filter((s) => s.type === 'products')
      .flatMap((s) => (Array.isArray(s.data?.items) ? s.data.items : []))
      .filter((item: any) => item?.name)
      .map((item: any) => ({
        name: String(item.name),
        price: item.price ? String(item.price) : undefined,
        description: item.description ? String(item.description) : undefined,
      }));
  }

  /** Reviews already on the page: the owner typed or kept them. */
  private testimonialsOf(content: WebsiteContent): { quote: string; author?: string; role?: string }[] {
    return content.sections
      .filter((s) => s.type === 'testimonials')
      .flatMap((s) => (Array.isArray(s.data?.items) ? s.data.items : []))
      .filter((item: any) => String(item?.quote || '').trim());
  }

  /**
   * Sections the model could not honestly fill are hidden rather than
   * deleted, so the owner finds them in the editor and can complete them:
   * a reviews section without a real review, and a custom section (opening
   * hours, practical details) left with a heading and nothing under it
   * because the brief held no facts for it.
   */
  private hideEmptySections(content: WebsiteContent): void {
    const filled = (item: any, keys: string[]) => keys.some((k) => String(item?.[k] || '').trim());
    for (const section of content.sections) {
      const items = Array.isArray(section.data?.items) ? section.data.items : [];
      if (section.type === 'testimonials' && !items.some((item: any) => filled(item, ['quote']))) {
        section.visible = false;
      }
      if (
        section.type === 'custom' &&
        !String(section.data?.body || '').trim() &&
        !items.some((item: any) => filled(item, ['name', 'description']))
      ) {
        section.visible = false;
      }
    }
  }

  private pickImages(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (data.imageUrl) out.imageUrl = data.imageUrl;
    if (Array.isArray(data.images)) out.images = data.images;
    return out;
  }

  // ---------- publish (LAST step) ----------

  async publishWebsite(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);

    // One deployed site per tenant. A different already-published site blocks it
    // (the same site can always be re-published/updated freely).
    const otherPublished = await this.prisma.website.findFirst({
      where: { tenantId, status: 'PUBLISHED', NOT: { id } },
    });
    if (otherPublished) {
      throw new BadRequestException(
        'Vous ne pouvez avoir qu’un seul site publié. Dépubliez votre site actuel avant d’en publier un autre.',
      );
    }

    const content = this.content(website);
    const deployHtml = this.renderer.renderForDeploy(content);

    this.logger.log(`Publishing website ${id} to Vercel...`);
    try {
      const result = await this.vercelDeploymentService.deployWebsite(
        website.subdomain,
        deployHtml,
        '',
        website.businessName,
      );
      await this.prisma.website.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          vercelProjectId: result.projectId,
          vercelDeploymentId: result.deploymentId,
          vercelUrl: result.url,
          deploymentStatus: result.status,
        } as any,
      });
      return {
        publishedUrl: result.url,
        deploymentId: result.deploymentId,
        status: result.status,
      };
    } catch (error: any) {
      this.logger.error(`Vercel deployment failed: ${error.message}`);
      throw new BadRequestException(`Deployment failed: ${error.message}`);
    }
  }

  /**
   * Take a site offline. Without this, publishWebsite()'s "only one published
   * site" rule was a dead end: it told users to unpublish with no way to do it.
   */
  async unpublishWebsite(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    if (website.status !== 'PUBLISHED') {
      throw new BadRequestException("Ce site n'est pas publié.");
    }

    // Take it off the internet BEFORE recording it as unpublished. The row
    // used to be flipped to DRAFT on its own, leaving the Vercel deployment
    // serving the page: the owner was told the site was down while anyone
    // holding the URL could still read it.
    const removed = await this.vercelDeploymentService.removeProject(website.subdomain);
    if (!removed) {
      throw new BadRequestException(
        "Le site n'a pas pu etre retire de Vercel; il est donc toujours en ligne. " +
          'Verifiez VERCEL_TOKEN puis reessayez.',
      );
    }

    const updated = await this.prisma.website.update({
      where: { id },
      data: {
        status: 'DRAFT',
        publishedAt: null,
        deploymentStatus: 'NONE',
        vercelProjectId: null,
        vercelDeploymentId: null,
        vercelUrl: null,
      } as any,
    });

    this.logger.log(`Website ${id} unpublished and removed from Vercel`);
    return this.toResponse(updated);
  }

  async getDeploymentStatus(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    const deploymentId = (website as any).vercelDeploymentId;
    if (!deploymentId) return { status: (website as any).deploymentStatus || 'NONE' };

    const status = await this.vercelDeploymentService.getDeploymentStatus(deploymentId);
    if (status.status === 'READY' && status.url) {
      await this.prisma.website.update({
        where: { id },
        data: { vercelUrl: status.url, deploymentStatus: 'READY' } as any,
      });
    }
    return status;
  }

  // ---------- helpers ----------

  private async owned(id: string, tenantId: string) {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException('Website not found');
    if (website.tenantId !== tenantId) throw new ForbiddenException('Not your website');
    return website;
  }

  private content(website: any): WebsiteContent {
    if (website.content) return website.content as WebsiteContent;
    // Legacy rows created before the structured model: rebuild minimally.
    return buildContent({
      businessName: website.businessName,
      businessType: website.businessType,
      description: website.description,
      services: website.services,
      colors: {
        primary: website.primaryColor,
        secondary: website.secondaryColor,
        accent: website.accentColor,
      },
      contact: {
        phone: website.contactPhone,
        email: website.contactEmail,
        address: website.contactAddress,
      },
    });
  }

  /** Re-render and save content + html (+ optional column mirrors). */
  private async persist(
    id: string,
    content: WebsiteContent,
    columns: Record<string, any> = {},
  ) {
    const html = this.renderer.render(content);
    const website = await this.prisma.website.update({
      where: { id },
      data: {
        content: content as any,
        html,
        logoUrl: content.logo.type === 'image' ? content.logo.imageUrl : null,
        logoText: content.logo.text,
        ...columns,
      },
    });
    return this.toResponse(website);
  }

  /**
   * Turn a pasted Google Maps URL into an embeddable location. Short links
   * (maps.app.goo.gl / goo.gl/maps) are expanded first, then coordinates are
   * extracted from the URL; falls back to the place name if no coords found.
   */
  private async resolveMapFromUrl(url: string): Promise<{ mapQuery?: string; address?: string }> {
    let full = (url || '').trim();
    if (!full) return {};
    if (WebsiteService.isShortMapsUrl(full)) {
      full = await this.expandUrl(full);
    }
    const coords = this.extractCoords(full);
    const address = this.extractPlaceName(full);
    if (coords) return { mapQuery: coords, address };
    if (address) return { mapQuery: address, address };
    return {};
  }

  /** Google's short-link hosts, matched on the parsed hostname. */
  private static readonly SHORT_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);
  /** Where a short link may lead: Google only. */
  private static isGoogleHost(host: string): boolean {
    return (
      WebsiteService.SHORT_MAPS_HOSTS.has(host) ||
      /^(?:[\w-]+\.)*google\.[a-z.]{2,6}$/i.test(host)
    );
  }

  private static parseHttps(url: string): URL | null {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' ? u : null;
    } catch {
      return null;
    }
  }

  private static isShortMapsUrl(url: string): boolean {
    const u = WebsiteService.parseHttps(url);
    if (!u) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl') return u.pathname.startsWith('/maps');
    if (host === 'g.co') return u.pathname.startsWith('/kgs');
    return false;
  }

  /**
   * Resolve a Google Maps short link server-side.
   *
   * The URL is user input, so this is an SSRF surface: the old unanchored
   * regex accepted `http://169.254.169.254/?maps.app.goo.gl` and fetch then
   * followed any redirect. Each hop is now checked — https, Google hosts only —
   * and redirects are followed by hand so none can lead inside the network.
   */
  private async expandUrl(url: string): Promise<string> {
    let current = url;
    let lastSafe = url;
    for (let hop = 0; hop < 5; hop++) {
      const u = WebsiteService.parseHttps(current);
      if (!u || !WebsiteService.isGoogleHost(u.hostname.toLowerCase())) return lastSafe;
      lastSafe = current;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(u, { redirect: 'manual', signal: controller.signal });
        const location = res.headers.get('location');
        if (res.status < 300 || res.status >= 400 || !location) return current;
        current = new URL(location, u).toString();
      } catch {
        return lastSafe;
      } finally {
        clearTimeout(timer);
      }
    }
    return lastSafe;
  }

  private extractCoords(u: string): string | undefined {
    let m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return `${m[1]},${m[2]}`;
    m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return `${m[1]},${m[2]}`;
    m = u.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
    if (m) return `${m[1]},${m[2]}`;
    return undefined;
  }

  private extractPlaceName(u: string): string | undefined {
    const m = u.match(/\/place\/([^/@]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1].replace(/\+/g, ' '));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private generateSubdomain(businessName: string): string {
    const normalized = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 6);
    return `${normalized || 'site'}-${suffix}`;
  }

  private toResponse(w: any) {
    return {
      id: w.id,
      subdomain: w.subdomain,
      status: w.status,
      // The client polls this while the photography renders in the background.
      visualStatus: w.visualStatus || 'READY',
      content: w.content,
      html: w.html,
      previewUrl: this.publicWebsiteUrl(w),
      vercelUrl: w.vercelUrl || undefined,
      deploymentStatus: w.deploymentStatus || 'NONE',
      publishedAt: w.publishedAt || undefined,
    };
  }

  private toSummary(w: any) {
    return {
      id: w.id,
      subdomain: w.subdomain,
      status: w.status,
      visualStatus: w.visualStatus || 'READY',
      businessName: w.businessName,
      previewUrl: this.publicWebsiteUrl(w),
      vercelUrl: w.vercelUrl || undefined,
      deploymentStatus: w.deploymentStatus || 'NONE',
      updatedAt: w.updatedAt,
    };
  }

  private publicWebsiteUrl(w: any): string {
    if (w.status === 'PUBLISHED' && w.vercelUrl) {
      return w.vercelUrl;
    }

    return '';
  }
}
