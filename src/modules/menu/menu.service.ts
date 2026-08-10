import { Injectable, NotFoundException, Inject, forwardRef, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { MenuGenerationDto, MenuUpdateDto, MenuBusinessType, MenuTemplate } from './menu.dto';

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AiEngineService))
    private aiEngineService: AiEngineService,
  ) {}

  async generateMenu(dto: MenuGenerationDto, tenantId: string, userId: string) {
    console.log('===========================================');
    console.log('[MenuService] generateMenu() called');
    console.log('[MenuService] dto:', JSON.stringify(dto, null, 2));
    console.log('[MenuService] tenantId:', tenantId);
    console.log('[MenuService] userId:', userId);
    console.log('===========================================');
    
    const slug = this.generateSlug(dto.businessName);
    
    // ALWAYS call AI to generate/enhance the menu (user-provided categories are used as context)
    const userCategories = dto.categories && Array.isArray(dto.categories) && dto.categories.length > 0
      ? dto.categories
      : null;
    console.log('[MenuService] user categories provided:', userCategories ? 'YES (will be used as context for AI)' : 'NO (AI will generate from scratch)');
    
    let categories: any[];
    console.log('[MenuService] Calling generateMenuWithAI()...');
    try {
      categories = await this.generateMenuWithAI(dto, userCategories);
      console.log('[MenuService] generateMenuWithAI() returned:', JSON.stringify(categories, null, 2));
    } catch (error) {
      console.error('[MenuService] AI menu generation failed:', error);
      throw new ServiceUnavailableException(
        "La génération IA du menu a échoué. Aucun menu générique n'a été créé; veuillez réessayer.",
      );
    }
    
    const visualUrl = await this.generateMenuVisual(dto, categories);
    const html = await this.generatePremiumMenuHtml(dto, categories, visualUrl);
    const css = this.buildMenuCss(dto);

    const menu = await this.prisma.menu.create({
      data: {
        name: `Menu ${dto.businessName}`,
        businessName: dto.businessName,
        businessType: dto.businessType,
        description: dto.description || '',
        categories: categories as any,
        template: dto.template || MenuTemplate.MODERN,
        primaryColor: dto.colors?.primary || '#3b82f6',
        secondaryColor: dto.colors?.secondary || '#1e3a8a',
        accentColor: dto.colors?.accent || '#22c55e',
        fontFamily: dto.fontFamily || 'Inter',
        html,
        css,
        slug,
        status: 'DRAFT',
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
      },
    });

    return {
      id: menu.id,
      name: menu.name,
      businessName: menu.businessName,
      businessType: menu.businessType,
      categories,
      template: menu.template,
      primaryColor: menu.primaryColor,
      secondaryColor: menu.secondaryColor,
      accentColor: menu.accentColor,
      slug: menu.slug,
      status: menu.status,
      createdAt: menu.createdAt,
    };
  }

  async getMenus(tenantId: string) {
    return this.prisma.menu.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMenuById(id: string, tenantId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id, tenantId },
    });

    if (!menu) {
      throw new NotFoundException('Menu not found');
    }

    return menu;
  }

  async updateMenu(id: string, dto: MenuUpdateDto, tenantId: string) {
    const existingMenu = await this.getMenuById(id, tenantId);
    
    const updateData: any = {};
    
    if (dto.name) updateData.name = dto.name;
    if (dto.categories) {
      updateData.categories = dto.categories;
      updateData.html = await this.generatePremiumMenuHtml(
        {
          businessName: existingMenu.businessName,
          businessType: existingMenu.businessType as MenuBusinessType,
          description: existingMenu.description || '',
          colors: {
            primary: dto.colors?.primary || existingMenu.primaryColor,
            secondary: dto.colors?.secondary || existingMenu.secondaryColor,
            accent: dto.colors?.accent || existingMenu.accentColor,
          },
          template: dto.template as MenuTemplate || existingMenu.template as MenuTemplate,
          fontFamily: dto.fontFamily || existingMenu.fontFamily,
          fontSizes: dto.fontSizes,
        },
        dto.categories,
        null,
      );
    }
    if (dto.template) updateData.template = dto.template;
    if (dto.colors) {
      if (dto.colors.primary) updateData.primaryColor = dto.colors.primary;
      if (dto.colors.secondary) updateData.secondaryColor = dto.colors.secondary;
      if (dto.colors.accent) updateData.accentColor = dto.colors.accent;
    }

    return this.prisma.menu.update({
      where: { id },
      data: updateData,
    });
  }

  async publishMenu(id: string, tenantId: string) {
    const menu = await this.getMenuById(id, tenantId);
    
    // In production, this would deploy to Vercel
    const vercelUrl = `https://${menu.slug}-menu.vercel.app`;
    const qrCodeUrl = `https://api.qrcode Monkey.com/create?data=${encodeURIComponent(vercelUrl)}`;

    return this.prisma.menu.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        vercelUrl,
        qrCodeUrl,
      },
    });
  }

  async deleteMenu(id: string, tenantId: string) {
    await this.getMenuById(id, tenantId);
    
    return this.prisma.menu.delete({
      where: { id },
    });
  }

  private generateSlug(businessName: string): string {
    const normalized = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const timestamp = Date.now();
    return `${normalized}-${timestamp}`;
  }

  private isMissingOrZeroPrice(price: unknown): boolean {
    if (price === null || price === undefined) return true;
    const normalized = String(price)
      .trim()
      .replace(',', '.')
      .replace(/[^\d.]/g, '');
    return normalized === '' || Number(normalized) === 0;
  }

  private extractJsonCandidate(response: string): string | null {
    const fencedJson = response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const source = fencedJson || response;
    const firstBrace = source.indexOf('{');
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) return source.slice(firstBrace, index + 1);
    }

    return source.slice(firstBrace);
  }

  private repairJsonCandidate(json: string): string[] {
    const withoutTrailingCommas = json.replace(/,\s*([}\]])/g, '$1').trim();
    const lastClosedCategories = withoutTrailingCommas.match(/^[\s\S]*\]\s*}/)?.[0];
    const attempts = new Set<string>([json, withoutTrailingCommas]);

    if (lastClosedCategories) {
      attempts.add(lastClosedCategories.replace(/,\s*([}\]])/g, '$1'));
    }

    let repaired = withoutTrailingCommas;
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/]/g) || []).length;
    repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
    attempts.add(repaired.replace(/,\s*([}\]])/g, '$1'));

    const arrayBoundaries = Array.from(withoutTrailingCommas.matchAll(/}\s*]/g));
    const lastArrayBoundary = arrayBoundaries.at(-1);
    if (lastArrayBoundary?.index !== undefined) {
      const end = lastArrayBoundary.index + lastArrayBoundary[0].length;
      attempts.add(`${withoutTrailingCommas.slice(0, end)}}`.replace(/,\s*([}\]])/g, '$1'));
    }

    return Array.from(attempts).filter(Boolean);
  }

  private parseMenuJson(response: string): any {
    const candidate = this.extractJsonCandidate(response);
    if (!candidate) {
      throw new Error('No JSON object found in AI response');
    }

    const errors: string[] = [];
    for (const attempt of this.repairJsonCandidate(candidate)) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`Unable to parse menu JSON after repair attempts: ${errors.slice(0, 3).join(' | ')}`);
  }

  private validateAndNormalizeCategories(parsed: any): any[] {
    if (!parsed || !Array.isArray(parsed.categories)) {
      throw new Error('Invalid AI menu format: missing categories array');
    }

    const categories = parsed.categories
      .map((category: any) => ({
        name: String(category?.name || '').trim(),
        description: category?.description ? String(category.description).trim() : '',
        items: Array.isArray(category?.items) ? category.items.map((item: any) => ({
          name: String(item?.name || '').trim(),
          description: item?.description ? String(item.description).trim() : '',
          price: String(item?.price || '').trim(),
        })) : [],
      }))
      .filter((category: any) => category.name && category.items.length > 0)
      .map((category: any) => ({
        ...category,
        items: category.items.filter((item: any) =>
          item.name && item.description && !this.isMissingOrZeroPrice(item.price),
        ),
      }))
      .filter((category: any) => category.items.length > 0);

    if (categories.length === 0) {
      throw new Error('Invalid AI menu format: no usable categories or items');
    }

    return categories;
  }

  private async generateMenuWithAI(dto: MenuGenerationDto, existingCategories?: any[] | null): Promise<any[]> {
    const model = process.env.NVIDIA_NIM_MENU_MODEL || 'z-ai/glm-5.2';
    console.log('===========================================');
    console.log('[MenuService] generateMenuWithAI() started');
    console.log('[MenuService] businessType:', dto.businessType);
    console.log('[MenuService] businessName:', dto.businessName);
    console.log('[MenuService] description:', dto.description);
    console.log('[MenuService] existingCategories provided:', existingCategories ? 'YES' : 'NO');
    console.log('===========================================');
    
    const businessTypeLabels: Record<MenuBusinessType, string> = {
      [MenuBusinessType.RESTAURANT]: 'restaurant gastronomique',
      [MenuBusinessType.CAFE]: 'café',
      [MenuBusinessType.BAR]: 'bar',
      [MenuBusinessType.BAKERY]: 'boulangerie',
      [MenuBusinessType.PIZZERIA]: 'pizzeria',
      [MenuBusinessType.SUSHI]: 'restaurant japonais / sushi',
      [MenuBusinessType.FAST_FOOD]: 'fast-food',
      [MenuBusinessType.ICE_CREAM]: 'glacier',
      [MenuBusinessType.FOOD_TRUCK]: 'food truck',
      [MenuBusinessType.OTHER]: 'établissement',
    };

    const businessTypeLabel = businessTypeLabels[dto.businessType] || 'établissement';
    const description = dto.description || '';
    const businessName = dto.businessName || 'Mon établissement';

    // If the user provided categories, include them as context so the AI enhances/expands them
    let existingCategoriesSection = '';
    if (existingCategories && existingCategories.length > 0) {
      const formatted = existingCategories
        .map((cat: any) => {
          const items = (cat.items || [])
            .map((it: any) => {
              const priceText = this.isMissingOrZeroPrice(it.price) ? '' : ` (${it.price})`;
              return `      - ${it.name}${priceText}`;
            })
            .join('\n');
          return `  - Catégorie: ${cat.name}\n${items}`;
        })
        .join('\n');
      existingCategoriesSection = `\n\nL'utilisateur a déjà fourni ces catégories et items de base. Améliore-les, complète-les avec des descriptions appétissantes, ajoute des items pertinents manquants, et ajoute d'autres catégories pertinentes si nécessaire:\n${formatted}\n`;
    }

    const prompt = `Tu es un expert en création de menus pour ${businessTypeLabel} nommé "${businessName}".
${description ? `Description de l'établissement: ${description}` : ''}${existingCategoriesSection}

Génère un menu complet et réaliste en français pour cet établissement. Réponds UNIQUEMENT avec du JSON valide (pas de markdown, pas de texte avant ou après) au format suivant:
{
  "categories": [
    {
      "name": "Nom de la catégorie",
      "description": "Courte description de la catégorie (optionnel)",
      "items": [
        {
          "name": "Nom du plat/produit",
          "description": "Description courte et appétissante",
          "price": "XX,XX €"
        }
      ]
    }
  ]
}

Règles importantes:
- 3 à 5 catégories maximum
- 3 à 6 items par catégorie
- Les prix doivent être réalistes pour le marché français
- Les noms de plats doivent être appétissants et professionnels
- Les descriptions doivent être courtes (1-2 phrases) et donner envie
- Réponds uniquement en JSON, sans texte avant ou après`;

    const menuSystemPrompt = `You are a senior menu strategist and culinary copywriter.
Return only strict JSON. No markdown, no comments, no prose before or after the JSON.
The JSON root must be an object with one key: "categories".
Each category must have "name", optional "description", and "items".
Each item must have "name", "description", and "price".
Use realistic French-market prices when a price is missing or zero.
Never use placeholder prices such as "0", "0,00 €", "XX,XX €", or empty strings.`;

    console.log('[MenuService] Prompt to send to LLM:');
    console.log(prompt);
    console.log('===========================================');

    try {
      console.log('[MenuService] Calling aiEngineService.generateText()...');
      const response = await this.aiEngineService.generateText({
        prompt,
        tone: 'professionnel',
        length: 'complet',
        language: 'français',
        maxTokens: 8192,
      }, model, menuSystemPrompt);
      
      console.log('[MenuService] LLM Response received:');
      console.log('[MenuService] Response type:', typeof response);
      console.log('[MenuService] Response:', response);

      console.log('[MenuService] Parsing LLM response...');
      const parsed = this.parseMenuJson(response);
      console.log('[MenuService] Parsed JSON:', JSON.stringify(parsed, null, 2));
      
      const categories = this.validateAndNormalizeCategories(parsed);
      console.log('[MenuService] SUCCESS: Generated', categories.length, 'categories with AI');
      console.log('===========================================');
      return categories;
    } catch (error) {
      console.error('[MenuService] ERROR calling AI for menu generation:', error);
      throw error;
    }
  }

  private async generateMenuVisual(dto: MenuGenerationDto, categories: any[]): Promise<string | null> {
    const categoryNames = categories.map(category => category.name).join(', ');
    const prompt = [
      `Premium editorial food and beverage photography for ${dto.businessName}.`,
      `Business type: ${dto.businessType}.`,
      dto.description ? `Concept: ${dto.description}.` : '',
      categoryNames ? `Menu universe: ${categoryNames}.` : '',
      'High-end restaurant menu cover visual, refined lighting, elegant composition, appetizing but not generic, no readable text, no logos, no watermark.',
    ].filter(Boolean).join(' ');

    try {
      const imageUrl = await this.aiEngineService.generateImage({
        prompt,
        size: '1024x1024',
        style: 'editorial',
      });

      if (/placehold\.co|Image\+Generation\+Failed|No\+Image\+Generated|Error\+Generating\+Image/i.test(imageUrl)) {
        throw new Error('FLUX returned a placeholder image');
      }

      console.log('[MenuService] Menu visual generated with FLUX');
      return imageUrl;
    } catch (error) {
      console.warn('[MenuService] FLUX menu visual unavailable; continuing with typography-first menu:', error);
      return null;
    }
  }

  private buildMenuCopySlots(dto: MenuGenerationDto, categories: any[]) {
    const copySlots: Record<string, string> = {
      '{{MENU_BUSINESS_NAME}}': dto.businessName,
      '{{MENU_DOCUMENT_LABEL}}': 'Carte',
    };

    if (dto.description?.trim()) {
      copySlots['{{MENU_DESCRIPTION}}'] = dto.description.trim();
    }

    const categoryStructure = categories.map((category, categoryIndex) => {
      const categoryToken = `{{MENU_CATEGORY_${categoryIndex + 1}_NAME}}`;
      copySlots[categoryToken] = category.name;

      const categoryDescriptionToken = category.description
        ? `{{MENU_CATEGORY_${categoryIndex + 1}_DESCRIPTION}}`
        : null;
      if (categoryDescriptionToken) {
        copySlots[categoryDescriptionToken] = category.description;
      }

      const itemTokens = category.items.map((item: any, itemIndex: number) => {
        const base = `{{MENU_CATEGORY_${categoryIndex + 1}_ITEM_${itemIndex + 1}`;
        const tokens = {
          name: `${base}_NAME}}`,
          description: `${base}_DESCRIPTION}}`,
          price: `${base}_PRICE}}`,
        };
        copySlots[tokens.name] = item.name;
        copySlots[tokens.description] = item.description;
        copySlots[tokens.price] = item.price;
        return tokens;
      });

      return {
        categoryToken,
        categoryDescriptionToken,
        itemTokens,
      };
    });

    return { copySlots, categoryStructure };
  }

  private async generatePremiumMenuHtml(
    dto: MenuGenerationDto,
    categories: any[],
    visualUrl: string | null,
  ): Promise<string> {
    const model = process.env.NVIDIA_NIM_MENU_MODEL || 'z-ai/glm-5.2';
    const { copySlots, categoryStructure } = this.buildMenuCopySlots(dto, categories);
    const colors = {
      primary: dto.colors?.primary || '#111827',
      secondary: dto.colors?.secondary || '#374151',
      accent: dto.colors?.accent || '#b45309',
    };
    const pageCount = dto.pageCount || Math.max(1, Math.min(4, Math.ceil(categories.length / 3)));
    const fontSizes = dto.fontSizes || { title: 54, category: 24, item: 16, description: 13, price: 16 };
    const templateDirection: Record<string, string> = {
      [MenuTemplate.MODERN]: 'modern editorial, confident spacing, precise Swiss-inspired grid',
      [MenuTemplate.CLASSIC]: 'timeless restaurant print design, refined rules, balanced serif typography',
      [MenuTemplate.MINIMAL]: 'quiet luxury minimalism, generous whitespace, restrained contrast',
      [MenuTemplate.ELEGANT]: 'haute cuisine, magazine-level art direction, delicate hierarchy',
      [MenuTemplate.RUSTIC]: 'crafted artisanal premium, natural textures through CSS, warm but polished',
    };
    const menuSlotPlan = categoryStructure.map((category: any, index: number) => {
      const categoryDescription = category.categoryDescriptionToken ? ` desc=${category.categoryDescriptionToken}` : '';
      const items = category.itemTokens
        .map((item: any) => `${item.name}|${item.description}|${item.price}`)
        .join('; ');
      return `P${Math.min(pageCount, index + 1)} ${category.categoryToken}${categoryDescription}: ${items}`;
    }).join('\n');

    const systemPrompt = `You are a Michelin-level menu art director, senior brand designer, and frontend engineer.
Create a bespoke premium restaurant/menu HTML document. The result must feel designed by an expert studio, not a template.

STRICT OUTPUT:
- Return only a complete HTML5 document from <!DOCTYPE html> to </html>.
- Use a neutral <title>Menu</title>. Do not place any {{MENU_*}} token in <head>.
- Use one <style> tag. No JavaScript, iframe, canvas, external images except {{MENU_VISUAL}}, emoji, fake logo, watermark, or framework.
- Exact root: <main class="menu-artwork">.
- Use the requested visual direction as inspiration only; never copy a reusable layout recipe.
- Must support print with @media print and multiple menu pages when useful.
- Body text minimum 12px. No unreadable microtext. No negative letter-spacing.
- Use CSS grid/flex, optical alignment, strong hierarchy, elegant spacing, and refined details.
- The only visible text allowed is the provided {{MENU_*}} tokens. Place each token exactly once and do not split a token with markup.
- Tokens must be in visible body text nodes only, never in <head>, <title>, CSS content, attributes, comments, aria-label, data-* or <style>.
- Do not invent dish names, sections, prices, dates, awards, slogans, labels, or paragraphs.
- If {{MENU_VISUAL}} is provided, use it exactly once as a major designed visual element. If not provided, create a typography-first layout with CSS shapes/textures only.
- Never mention AI, NVIDIA, GLM, FLUX, prompt, JSON, or template.`;

    const prompt = `Brief: ${dto.businessType} premium menu for ${pageCount} page(s).
Direction: ${templateDirection[dto.template || MenuTemplate.MODERN] || templateDirection[MenuTemplate.MODERN]}.
Palette: primary ${colors.primary}, secondary ${colors.secondary}, accent ${colors.accent}.
Font: ${dto.fontFamily || 'Inter'}. Sizes: ${JSON.stringify(fontSizes)}.
Visual: ${visualUrl ? 'use {{MENU_VISUAL}} exactly once' : 'no image URL; typography-first'}.
Required visible slots:
{{MENU_BUSINESS_NAME}} | {{MENU_DOCUMENT_LABEL}}${dto.description?.trim() ? ' | {{MENU_DESCRIPTION}}' : ''}
${menuSlotPlan}

Create complete premium HTML/CSS. Keep the document compact, polished, print-ready, and specific to the cafe/menu world.`;

    const normalize = (value: string) => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&amp;|&/gi, ' et ')
      .replace(/&nbsp;/gi, ' ')
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const escapeVisibleText = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    let correction = '';
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        console.log(`[MenuService] GLM-5.2 premium menu HTML attempt ${attempt}/3${visualUrl ? ' + FLUX' : ''}`);
        const response = await this.aiEngineService.generateText({
          prompt: `${prompt}${correction}`,
          tone: 'expert',
          length: 'LONG',
          language: 'français',
          maxTokens: attempt === 1 ? 14000 : 10000,
        }, model, systemPrompt);

        const match = response.match(/<!doctype html[\s\S]*?<\/html>/i);
        if (!match) throw new Error('incomplete HTML document');

        let html = match[0]
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)>/gi, '')
          .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
          .replace(/javascript\s*:/gi, '');

        const bodyBeforeCopy = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
        const nonBodyMarkup = html.replace(bodyBeforeCopy, '');
        const visibleTextBeforeCopy = bodyBeforeCopy
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ');
        const slotIssues = Object.keys(copySlots).flatMap(token => {
          const visibleCount = visibleTextBeforeCopy.split(token).length - 1;
          if (visibleCount !== 1) return [`${token} expected once in visible body text, received ${visibleCount}`];
          if (nonBodyMarkup.includes(token)) return [`${token} cannot appear outside body visible text`];
          return [];
        });
        if (slotIssues.length) throw new Error(`copy slots invalid: ${slotIssues.slice(0, 6).join('; ')}`);

        for (const [token, value] of Object.entries(copySlots)) {
          html = html.replace(token, escapeVisibleText(value));
        }
        if (/\{\{MENU_(?!VISUAL\}\})[^}]+}}/.test(html)) throw new Error('unknown or unresolved menu copy slot');

        const issues: string[] = [];
        if (!/<main\b[^>]*class=["'][^"']*\bmenu-artwork\b/i.test(html)) issues.push('missing .menu-artwork root');
        if (!/<style\b/i.test(html) || !/<body\b/i.test(html)) issues.push('missing HTML structure');
        if (!/@media\s+print/i.test(html)) issues.push('print stylesheet missing');
        if (html.length < 4500) issues.push('menu design too shallow');
        if ((html.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi) || [])
          .map(rule => Number(rule.match(/\d+(?:\.\d+)?/)?.[0] || 0))
          .filter(size => size > 0 && size < 12).length > 0) {
          issues.push('text smaller than 12px');
        }

        const flat = normalize(html);
        Object.values(copySlots).forEach(value => {
          if (!flat.includes(normalize(value))) {
            issues.push(`provided text missing: ${value.slice(0, 40)}`);
          }
        });

        const visualCount = (html.match(/\{\{MENU_VISUAL}}/g) || []).length;
        if (visualUrl && visualCount !== 1) issues.push('FLUX visual must appear exactly once');
        if (!visualUrl && /https?:\/\/[^"')\s]+\.(?:png|jpe?g|webp)/i.test(html)) issues.push('invented image URL');

        if (issues.length) throw new Error(issues.slice(0, 8).join('; '));

        html = visualUrl ? html.replace('{{MENU_VISUAL}}', visualUrl) : html.replace(/\{\{MENU_VISUAL}}/g, '');
        console.log(`[MenuService] Premium menu HTML accepted (${html.length} chars)`);
        return html;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        correction = `\nRevision required: ${lastError.message}. Output a shorter corrected HTML. Put each token once in body text only.`;
        console.warn(`[MenuService] Premium menu attempt ${attempt} rejected: ${lastError.message}`);
      }
    }

    throw lastError || new Error('Premium menu generation failed');
  }

  private buildMenuHtml(dto: MenuGenerationDto, categories: any[]) {
    const template = dto.template || MenuTemplate.MODERN;
    
    const templates: Record<string, string> = {
      [MenuTemplate.MODERN]: this.buildModernMenuHtml(dto, categories),
      [MenuTemplate.CLASSIC]: this.buildClassicMenuHtml(dto, categories),
      [MenuTemplate.MINIMAL]: this.buildMinimalMenuHtml(dto, categories),
      [MenuTemplate.ELEGANT]: this.buildElegantMenuHtml(dto, categories),
      [MenuTemplate.RUSTIC]: this.buildRusticMenuHtml(dto, categories),
    };

    return templates[template] || templates[MenuTemplate.MODERN];
  }

  private buildModernMenuHtml(dto: MenuGenerationDto, categories: any[]): string {
    const categoriesHtml = categories.map(cat => `
      <div class="menu-category">
        <h2 class="category-title">${cat.name}</h2>
        ${cat.description ? `<p class="category-desc">${cat.description}</p>` : ''}
        <div class="category-items">
          ${cat.items.map(item => `
            <div class="menu-item">
              <div class="item-header">
                <span class="item-name">${item.name}</span>
                <span class="item-price">${item.price}</span>
              </div>
              ${item.description ? `<p class="item-desc">${item.description}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu - ${dto.businessName}</title>
  <link href="https://fonts.googleapis.com/css2?family=${dto.fontFamily || 'Inter'}:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: '${dto.fontFamily || 'Inter'}', sans-serif; background: #fafafa; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 50px; }
    .header h1 { font-size: 2.5rem; font-weight: 700; color: ${dto.colors?.primary || '#3b82f6'}; margin-bottom: 10px; }
    .header p { color: #666; font-size: 1.1rem; }
    .menu-category { background: white; border-radius: 16px; padding: 30px; margin-bottom: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .category-title { font-size: 1.5rem; font-weight: 600; color: ${dto.colors?.primary || '#3b82f6'}; margin-bottom: 5px; border-bottom: 2px solid ${dto.colors?.accent || '#22c55e'}; padding-bottom: 10px; }
    .category-desc { color: #888; font-size: 0.9rem; margin-bottom: 20px; font-style: italic; }
    .menu-item { padding: 15px 0; border-bottom: 1px solid #eee; }
    .menu-item:last-child { border-bottom: none; }
    .item-header { display: flex; justify-content: space-between; align-items: center; }
    .item-name { font-weight: 500; font-size: 1.1rem; }
    .item-price { font-weight: 600; color: ${dto.colors?.primary || '#3b82f6'}; font-size: 1.1rem; }
    .item-desc { color: #888; font-size: 0.9rem; margin-top: 5px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dto.businessName}</h1>
      <p>Notre carte</p>
    </div>
    ${categoriesHtml}
    <div class="footer">
      <p>Scannez le QR code pour commander en ligne</p>
    </div>
  </div>
</body>
</html>`;
  }

  private buildClassicMenuHtml(dto: MenuGenerationDto, categories: any[]): string {
    const categoriesHtml = categories.map(cat => `
      <div class="menu-category">
        <h2 class="category-title">${cat.name}</h2>
        ${cat.description ? `<p class="category-desc">${cat.description}</p>` : ''}
        <div class="category-items">
          ${cat.items.map(item => `
            <div class="menu-item">
              <span class="item-name">${item.name}</span>
              <span class="item-dots"></span>
              <span class="item-price">${item.price}</span>
            </div>
            ${item.description ? `<p class="item-desc">${item.description}</p>` : ''}
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu - ${dto.businessName}</title>
  <link href="https://fonts.googleapis.com/css2?family=${dto.fontFamily || 'Playfair Display'}:wght@400;600;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lato', sans-serif; background: #fffef5; color: #2c2c2c; }
    .container { max-width: 700px; margin: 0 auto; padding: 50px 30px; }
    .header { text-align: center; margin-bottom: 50px; border-bottom: 3px double ${dto.colors?.primary || '#3b82f6'}; padding-bottom: 30px; }
    .header h1 { font-family: 'Playfair Display', serif; font-size: 2.8rem; color: ${dto.colors?.primary || '#3b82f6'}; margin-bottom: 10px; }
    .header p { font-style: italic; color: #666; }
    .menu-category { margin-bottom: 40px; }
    .category-title { font-family: 'Playfair Display', serif; font-size: 1.6rem; color: ${dto.colors?.secondary || '#1e3a8a'}; margin-bottom: 15px; text-align: center; }
    .category-desc { text-align: center; color: #888; font-style: italic; margin-bottom: 20px; }
    .menu-item { display: flex; align-items: baseline; margin-bottom: 8px; }
    .item-name { flex: 1; font-size: 1.1rem; }
    .item-dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 10px; }
    .item-price { font-weight: 700; color: ${dto.colors?.primary || '#3b82f6'}; }
    .item-desc { color: #888; font-size: 0.85rem; margin-left: 0; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dto.businessName}</h1>
      <p>La Carte</p>
    </div>
    ${categoriesHtml}
  </div>
</body>
</html>`;
  }

  private buildMinimalMenuHtml(dto: MenuGenerationDto, categories: any[]): string {
    const categoriesHtml = categories.map(cat => `
      <div class="menu-category">
        <h2 class="category-title">${cat.name}</h2>
        <div class="category-items">
          ${cat.items.map(item => `
            <div class="menu-item">
              <div class="item-info">
                <span class="item-name">${item.name}</span>
                ${item.description ? `<span class="item-desc">${item.description}</span>` : ''}
              </div>
              <span class="item-price">${item.price}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu - ${dto.businessName}</title>
  <link href="https://fonts.googleapis.com/css2?family=${dto.fontFamily || 'Inter'}:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: '${dto.fontFamily || 'Inter'}', sans-serif; background: #ffffff; color: #000; }
    .container { max-width: 600px; margin: 0 auto; padding: 60px 30px; }
    .header { margin-bottom: 60px; }
    .header h1 { font-size: 1.5rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; }
    .menu-category { margin-bottom: 50px; }
    .category-title { font-size: 0.75rem; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #999; margin-bottom: 20px; }
    .menu-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-top: 1px solid #eee; }
    .item-info { flex: 1; }
    .item-name { display: block; font-size: 1rem; font-weight: 400; }
    .item-desc { display: block; font-size: 0.8rem; color: #999; margin-top: 4px; }
    .item-price { font-size: 1rem; font-weight: 400; margin-left: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dto.businessName}</h1>
    </div>
    ${categoriesHtml}
  </div>
</body>
</html>`;
  }

  private buildElegantMenuHtml(dto: MenuGenerationDto, categories: any[]): string {
    const categoriesHtml = categories.map(cat => `
      <div class="menu-category">
        <div class="category-header">
          <h2 class="category-title">${cat.name}</h2>
          ${cat.description ? `<p class="category-desc">${cat.description}</p>` : ''}
        </div>
        <div class="category-items">
          ${cat.items.map(item => `
            <div class="menu-item">
              <div class="item-left">
                <span class="item-name">${item.name}</span>
                ${item.description ? `<p class="item-desc">${item.description}</p>` : ''}
              </div>
              <span class="item-price">${item.price}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu - ${dto.businessName}</title>
  <link href="https://fonts.googleapis.com/css2?family=${dto.fontFamily || 'Cormorant Garamond'}:wght@400;500;600&family=Montserrat:wght@300;400&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Montserrat', sans-serif; background: linear-gradient(135deg, #f5f5f5 0%, #fff 100%); color: #333; min-height: 100vh; }
    .container { max-width: 750px; margin: 0 auto; padding: 60px 40px; }
    .header { text-align: center; margin-bottom: 60px; position: relative; }
    .header::before, .header::after { content: '✦'; position: absolute; top: 50%; color: ${dto.colors?.accent || '#22c55e'}; font-size: 1.2rem; }
    .header::before { left: 20%; }
    .header::after { right: 20%; }
    .header h1 { font-family: 'Cormorant Garamond', serif; font-size: 3rem; font-weight: 400; color: ${dto.colors?.primary || '#3b82f6'}; letter-spacing: 0.05em; }
    .header p { font-size: 0.9rem; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-top: 10px; }
    .menu-category { background: white; border-radius: 8px; padding: 35px; margin-bottom: 25px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); }
    .category-header { text-align: center; margin-bottom: 25px; }
    .category-title { font-family: 'Cormorant Garamond', serif; font-size: 1.8rem; font-weight: 500; color: ${dto.colors?.secondary || '#1e3a8a'}; }
    .category-desc { font-size: 0.85rem; color: #999; font-style: italic; margin-top: 5px; }
    .menu-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #f0f0f0; }
    .menu-item:last-child { border-bottom: none; }
    .item-left { flex: 1; }
    .item-name { font-size: 1.05rem; font-weight: 500; }
    .item-desc { font-size: 0.85rem; color: #888; margin-top: 4px; }
    .item-price { font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 600; color: ${dto.colors?.primary || '#3b82f6'}; margin-left: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dto.businessName}</h1>
      <p>Notre Carte</p>
    </div>
    ${categoriesHtml}
  </div>
</body>
</html>`;
  }

  private buildRusticMenuHtml(dto: MenuGenerationDto, categories: any[]): string {
    const categoriesHtml = categories.map(cat => `
      <div class="menu-category">
        <h2 class="category-title">${cat.name}</h2>
        ${cat.description ? `<p class="category-desc">${cat.description}</p>` : ''}
        <div class="category-items">
          ${cat.items.map(item => `
            <div class="menu-item">
              <div class="item-main">
                <span class="item-name">${item.name}</span>
                ${item.description ? `<span class="item-desc">${item.description}</span>` : ''}
              </div>
              <span class="item-price">${item.price}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu - ${dto.businessName}</title>
  <link href="https://fonts.googleapis.com/css2?family=${dto.fontFamily || 'Merriweather'}:wght@400;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Open Sans', sans-serif; background: #f5f0e8; color: #3d3d3d; }
    .container { max-width: 700px; margin: 0 auto; padding: 50px 30px; }
    .header { text-align: center; margin-bottom: 50px; padding: 30px; background: ${dto.colors?.primary || '#3b82f6'}; color: white; border-radius: 8px; }
    .header h1 { font-family: 'Merriweather', serif; font-size: 2.5rem; font-weight: 700; margin-bottom: 10px; }
    .header p { font-size: 1rem; opacity: 0.9; }
    .menu-category { background: white; border-radius: 8px; padding: 30px; margin-bottom: 25px; border-left: 4px solid ${dto.colors?.accent || '#22c55e'}; }
    .category-title { font-family: 'Merriweather', serif; font-size: 1.4rem; color: ${dto.colors?.secondary || '#1e3a8a'}; margin-bottom: 5px; }
    .category-desc { color: #888; font-size: 0.9rem; margin-bottom: 20px; }
    .menu-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #ddd; }
    .menu-item:last-child { border-bottom: none; }
    .item-main { flex: 1; }
    .item-name { display: block; font-weight: 600; font-size: 1.05rem; }
    .item-desc { display: block; font-size: 0.85rem; color: #777; margin-top: 3px; }
    .item-price { font-family: 'Merriweather', serif; font-weight: 700; font-size: 1.1rem; color: ${dto.colors?.primary || '#3b82f6'}; margin-left: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dto.businessName}</h1>
      <p>Notre Menu</p>
    </div>
    ${categoriesHtml}
  </div>
</body>
</html>`;
  }

  private buildMenuCss(dto: MenuGenerationDto): string {
    return `
      :root {
        --primary: ${dto.colors?.primary || '#3b82f6'};
        --secondary: ${dto.colors?.secondary || '#1e3a8a'};
        --accent: ${dto.colors?.accent || '#22c55e'};
      }
    `;
  }
}
