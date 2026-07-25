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
import { VercelDeploymentService } from './vercel-deployment.service';
import { WebsiteRendererService } from './website-renderer.service';
import { buildContent, BuildInput, normalizeSection } from './website-content.builder';
import { getPath, setPath } from './content-path.util';
import { WebsiteContent, Section } from './website-content.types';

export interface ProductDto {
  name: string;
  price: string;
  imageUrl?: string;
  imagePrompt?: string;
  description?: string;
}

export interface WebsiteGenerationDto {
  businessName: string;
  businessType: string;
  description: string;
  services?: string[];
  products?: ProductDto[];
  gallery?: { enabled?: boolean; images?: { imageUrl?: string; imagePrompt?: string }[] };
  context?: string;
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
  ) {}

  // ---------- create ----------

  async generateWebsite(dto: WebsiteGenerationDto, tenantId: string, userId: string) {
    if (!tenantId || !userId) {
      throw new BadRequestException('Missing tenant or user context');
    }

    const products = dto.products || [];
    const language = dto.language || 'fr';

    // Resolve the pasted Google Maps URL into an embeddable location.
    const contact = { ...(dto.contactInfo || {}) };
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
      currency: dto.currency,
    };

    // Pull tone / target audience from the tenant's brand to enrich the copy.
    const brand = await this.prisma.brand.findFirst({ where: { tenantId } });
    input.tone = brand?.tone || 'professional';
    input.targetAudience = brand?.targetAudience || undefined;

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
        context: input.context,
        // When the user provides products, skip the AI "services" section.
        sections: products.length
          ? ['hero', 'about', 'testimonials', 'faq', 'cta', 'contact']
          : undefined,
      });
    } catch (err: any) {
      this.logger.warn(`AI content generation failed, using fallback: ${err.message}`);
    }

    const content = buildContent(input, ai);
    // Fill every empty image slot (hero, about, gallery, products, custom) with AI.
    // Pass rich business context so images match the actual business, not a
    // generic (and often wrong) interpretation of just the category.
    const bizContext = [dto.businessType, dto.businessName, (dto.description || '').slice(0, 120)]
      .filter(Boolean)
      .join(', ');
    await this.generateContentImages(content, bizContext, `t-${tenantId}`);
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
        tenantId,
        userId,
      },
    });

    return this.toResponse(website);
  }

  /**
   * Fill every empty image slot across the content with an AI-generated image,
   * in small parallel batches (to stay within provider limits). If generation
   * is disabled/fails, generateImage returns an instant placeholder.
   */
  private async generateContentImages(content: WebsiteContent, bizContext: string, scope: string) {
    const tasks: { prompt: string; assign: (url: string) => void }[] = [];
    const clean = ', realistic high quality professional photography, no animals, no text, no watermark';

    for (const s of content.sections) {
      const d: any = s.data || {};
      if ((s.type === 'hero' || s.type === 'about' || s.type === 'custom') && !d.imageUrl) {
        tasks.push({
          prompt: (d.imagePrompt ? d.imagePrompt : `${bizContext}, interior ambiance`) + clean,
          assign: (u) => (d.imageUrl = u),
        });
      }
      if (s.type === 'gallery' && Array.isArray(d.images)) {
        d.images.forEach((img: string, i: number) => {
          if (!img) {
            const custom = d.imagePrompts?.[i];
            tasks.push({
              prompt: (custom ? custom : `${bizContext}, interior ambiance, atmosphere`) + clean,
              assign: (u) => (d.images[i] = u),
            });
          }
        });
      }
      if (s.type === 'products' && Array.isArray(d.items)) {
        d.items.forEach((it: any) => {
          if (!it.imageUrl) {
            tasks.push({
              prompt: it.imagePrompt
                ? `${it.imagePrompt}, ${bizContext}, clean neutral background, realistic professional product photography, no text, no watermark`
                : `Professional product photograph of "${it.name}"${it.description ? ' (' + it.description + ')' : ''}, ${bizContext}, clean neutral background, soft studio lighting, realistic, sharp focus, no text, no watermark`,
              assign: (u) => (it.imageUrl = u),
            });
          }
        });
      }
    }

    const BATCH = 3;
    for (let i = 0; i < tasks.length; i += BATCH) {
      await Promise.all(
        tasks.slice(i, i + BATCH).map(async (t) => {
          try {
            const url = await this.aiEngineService.generateImage({
              prompt: t.prompt,
              size: '1024x1024',
              scope,
            } as any);
            t.assign(url);
          } catch (err: any) {
            this.logger.warn(`Slot image generation failed: ${err.message}`);
          }
        }),
      );
    }
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

  /** Generate an image with AI for a given slot. */
  async generateImageForSlot(id: string, tenantId: string, path: string, prompt?: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const seed =
      prompt ||
      getPath(content, path.replace(/\.imageUrl$/, '.imagePrompt')) ||
      content.meta.title;
    const url = await this.aiEngineService.generateImage({
      prompt: String(seed),
      size: '1024x1024',
      scope: id,
    } as any);
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
      patch = await this.aiEngineService.generateThemePatch(instruction, content.theme);
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
      });
    } catch (err: any) {
      this.logger.warn(`Section generation failed: ${err.message}`);
      raw = { type: 'custom', data: { heading: request, subheading: '', body: '', items: [] } };
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

  async regenerateAll(id: string, tenantId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const brand = await this.prisma.brand.findFirst({ where: { tenantId } });

    let ai: any;
    try {
      ai = await this.aiEngineService.generateWebsiteContentJson({
        businessName: website.businessName,
        businessType: website.businessType,
        description: website.description,
        services: website.services,
        targetAudience: brand?.targetAudience || undefined,
        tone: brand?.tone || 'professional',
        language: content.meta.language,
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
      },
      ai,
    );
    rebuilt.logo = content.logo;
    rebuilt.contact = content.contact;
    return this.persist(id, rebuilt);
  }

  async regenerateSection(id: string, tenantId: string, sectionId: string) {
    const website = await this.owned(id, tenantId);
    const content = this.content(website);
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');

    try {
      if (section.type === 'custom') {
        const raw = await this.aiEngineService.generateSectionJson({
          request: section.data.request || section.data.heading || 'section',
          businessName: website.businessName,
          businessType: website.businessType,
          description: website.description,
          language: content.meta.language,
        });
        const fresh = normalizeSection(raw);
        if (fresh) section.data = { ...fresh.data, request: section.data.request };
      } else {
        // Re-run full generation and swap in the matching-type section's copy.
        const ai = await this.aiEngineService.generateWebsiteContentJson({
          businessName: website.businessName,
          businessType: website.businessType,
          description: website.description,
          services: website.services,
          language: content.meta.language,
        });
        const match = (ai?.sections || []).find((x: any) => x.type === section.type);
        if (match?.data) {
          const keepImages = this.pickImages(section.data);
          section.data = { ...match.data, ...keepImages };
        }
      }
    } catch (err: any) {
      throw new BadRequestException(`Section regeneration failed: ${err.message}`);
    }
    return this.persist(id, content);
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
    if (/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/.test(full)) {
      full = await this.expandUrl(full);
    }
    const coords = this.extractCoords(full);
    const address = this.extractPlaceName(full);
    if (coords) return { mapQuery: coords, address };
    if (address) return { mapQuery: address, address };
    return {};
  }

  private async expandUrl(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
      return res.url || url;
    } catch {
      return url;
    } finally {
      clearTimeout(timer);
    }
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
      content: w.content,
      html: w.html,
      previewUrl: w.vercelUrl || `https://${w.subdomain}.vercel.app`,
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
      businessName: w.businessName,
      previewUrl: w.vercelUrl || `https://${w.subdomain}.vercel.app`,
      vercelUrl: w.vercelUrl || undefined,
      deploymentStatus: w.deploymentStatus || 'NONE',
      updatedAt: w.updatedAt,
    };
  }
}
