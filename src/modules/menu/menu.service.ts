import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
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
      console.error('[MenuService] AI generation failed, using default categories:', error);
      categories = userCategories || this.generateDefaultCategories(dto.businessType);
      console.log('[MenuService] Using fallback categories instead');
    }
    
    // Build HTML menu
    const html = this.buildMenuHtml(dto, categories);
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
      // Regenerate HTML with new categories
      updateData.html = this.buildMenuHtml(
        {
          businessName: existingMenu.businessName,
          businessType: existingMenu.businessType as MenuBusinessType,
          colors: {
            primary: dto.colors?.primary || existingMenu.primaryColor,
            secondary: dto.colors?.secondary || existingMenu.secondaryColor,
            accent: dto.colors?.accent || existingMenu.accentColor,
          },
          template: dto.template as MenuTemplate || existingMenu.template as MenuTemplate,
          fontFamily: dto.fontFamily || existingMenu.fontFamily,
        },
        dto.categories
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

  private generateDefaultCategories(businessType: MenuBusinessType) {
    const categoryTemplates: Record<MenuBusinessType, any[]> = {
      [MenuBusinessType.RESTAURANT]: [
        { name: 'Entrées', description: 'Pour commencer', items: [
          { name: 'Salade César', description: 'Laitue romaine, parmesan, croûtons', price: '8,50 €' },
          { name: 'Soupe du jour', description: 'Change selon le marché', price: '6,00 €' },
        ]},
        { name: 'Plats principaux', description: 'Nos spécialités', items: [
          { name: 'Poulet rôti', description: 'Poulet fermier, légumes de saison', price: '18,00 €' },
          { name: 'Pâtes Carbonara', description: 'Spaghetti, bacon, parmesan, œuf', price: '15,00 €' },
        ]},
        { name: 'Desserts', description: 'Pour finir en beauté', items: [
          { name: 'Tiramisu', description: 'Recette traditionnelle', price: '7,00 €' },
          { name: 'Crème brûlée', description: 'Vanille de Madagascar', price: '6,50 €' },
        ]},
      ],
      [MenuBusinessType.CAFE]: [
        { name: 'Boissons chaudes', items: [
          { name: 'Café espresso', price: '2,50 €' },
          { name: 'Cappuccino', price: '4,00 €' },
          { name: 'Thé vert', price: '3,50 €' },
        ]},
        { name: 'Boissons fraîches', items: [
          { name: 'Jus d\'orange frais', price: '5,00 €' },
          { name: 'Smoothie fruits rouges', price: '6,50 €' },
        ]},
        { name: 'Pâtisseries', items: [
          { name: 'Croissant', price: '2,00 €' },
          { name: 'Pain au chocolat', price: '2,50 €' },
        ]},
      ],
      [MenuBusinessType.BAR]: [
        { name: 'Cocktails classiques', items: [
          { name: 'Mojito', price: '10,00 €' },
          { name: 'Margarita', price: '10,00 €' },
          { name: 'Old Fashioned', price: '12,00 €' },
        ]},
        { name: 'Vins', items: [
          { name: 'Rouge - Bordeaux', price: '6,00 €' },
          { name: 'Blanc - Chardonnay', price: '6,00 €' },
          { name: 'Rosé - Provence', price: '5,50 €' },
        ]},
        { name: 'Bières', items: [
          { name: 'Blonde pression 25cl', price: '4,00 €' },
          { name: 'Blonde pression 50cl', price: '7,00 €' },
        ]},
      ],
      [MenuBusinessType.BAKERY]: [
        { name: 'Pains', items: [
          { name: 'Baguette traditionnelle', price: '1,20 €' },
          { name: 'Pain aux céréales', price: '1,80 €' },
        ]},
        { name: 'Viennoiseries', items: [
          { name: 'Croissant pur beurre', price: '1,50 €' },
          { name: 'Pain aux raisins', price: '1,80 €' },
        ]},
        { name: 'Gâteaux', items: [
          { name: 'Tarte aux fruits', price: '15,00 €' },
          { name: 'Forêt noire', price: '18,00 €' },
        ]},
      ],
      [MenuBusinessType.PIZZERIA]: [
        { name: 'Pizzas classiques', items: [
          { name: 'Margherita', description: 'Tomate, mozzarella, basilic', price: '10,00 €' },
          { name: 'Regina', description: 'Tomate, mozzarella, jambon, champignons', price: '12,00 €' },
        ]},
        { name: 'Pizzas spéciales', items: [
          { name: '4 Fromages', description: 'Mozzarella, gorgonzola, parmesan, chèvre', price: '14,00 €' },
          { name: 'Calzone', description: 'Tomate, mozzarella, jambon, œuf', price: '13,00 €' },
        ]},
        { name: 'Boissons', items: [
          { name: 'Coca-Cola 33cl', price: '3,00 €' },
          { name: 'Eau minérale 50cl', price: '2,00 €' },
        ]},
      ],
      [MenuBusinessType.SUSHI]: [
        { name: 'Entrées', items: [
          { name: 'Miso soupe', price: '3,00 €' },
          { name: 'Edamame', price: '4,50 €' },
        ]},
        { name: 'Nigiri', items: [
          { name: 'Saumon (2 pcs)', price: '5,00 €' },
          { name: 'Thon (2 pcs)', price: '6,00 €' },
        ]},
        { name: 'Maki', items: [
          { name: 'Maki california (8 pcs)', price: '8,00 €' },
          { name: 'Maki thon (8 pcs)', price: '9,00 €' },
        ]},
      ],
      [MenuBusinessType.FAST_FOOD]: [
        { name: 'Burgers', items: [
          { name: 'Classic Burger', description: 'Boeuf, cheddar, salade, tomate', price: '9,00 €' },
          { name: 'Chicken Burger', description: 'Poulet croustillant, mayo', price: '8,50 €' },
        ]},
        { name: 'Frites & Snacks', items: [
          { name: 'Frites moyennes', price: '3,00 €' },
          { name: 'Onion rings', price: '4,00 €' },
        ]},
        { name: 'Boissons', items: [
          { name: 'Coca-Cola', price: '2,50 €' },
          { name: 'Milkshake', price: '4,50 €' },
        ]},
      ],
      [MenuBusinessType.ICE_CREAM]: [
        { name: 'Glaces en coupe', items: [
          { name: '1 boule', price: '2,50 €' },
          { name: '2 boules', price: '4,00 €' },
          { name: '3 boules', price: '5,50 €' },
        ]},
        { name: 'Glaces en cornet', items: [
          { name: '1 boule', price: '2,00 €' },
          { name: '2 boules', price: '3,50 €' },
        ]},
        { name: 'Spécialités', items: [
          { name: 'Banana split', price: '8,00 €' },
          { name: ' Sundae caramel', price: '6,00 €' },
        ]},
      ],
      [MenuBusinessType.FOOD_TRUCK]: [
        { name: 'Burgers', items: [
          { name: 'Street Burger', price: '8,00 €' },
          { name: 'Cheese Burger', price: '9,00 €' },
        ]},
        { name: 'Tacos', items: [
          { name: 'Taco poulet', price: '7,00 €' },
          { name: 'Taco boeuf', price: '8,00 €' },
        ]},
        { name: 'Boissons', items: [
          { name: 'Limonade maison', price: '3,00 €' },
          { name: 'Eau gazeuse', price: '2,00 €' },
        ]},
      ],
      [MenuBusinessType.OTHER]: [
        { name: 'Entrées', items: [
          { name: 'Entrée 1', price: '0,00 €' },
        ]},
        { name: 'Plats', items: [
          { name: 'Plat 1', price: '0,00 €' },
        ]},
        { name: 'Desserts', items: [
          { name: 'Dessert 1', price: '0,00 €' },
        ]},
      ],
    };

    return categoryTemplates[businessType] || categoryTemplates[MenuBusinessType.OTHER];
  }

  private async generateMenuWithAI(dto: MenuGenerationDto, existingCategories?: any[] | null): Promise<any[]> {
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
            .map((it: any) => `      - ${it.name}${it.price ? ' (' + it.price + ')' : ''}`)
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
      });
      
      console.log('[MenuService] LLM Response received:');
      console.log('[MenuService] Response type:', typeof response);
      console.log('[MenuService] Response:', response);

      // Parse the JSON response from the LLM
      console.log('[MenuService] Parsing LLM response...');
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[MenuService] No JSON found in LLM response:', response);
        console.log('[MenuService] Falling back to default categories');
        return this.generateDefaultCategories(dto.businessType);
      }

      console.log('[MenuService] JSON found, parsing...');
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[MenuService] Parsed JSON:', JSON.stringify(parsed, null, 2));
      
      if (parsed.categories && Array.isArray(parsed.categories)) {
        console.log('[MenuService] SUCCESS: Generated', parsed.categories.length, 'categories with AI');
        console.log('===========================================');
        return parsed.categories;
      } else {
        console.error('[MenuService] Invalid LLM response format:', parsed);
        console.log('[MenuService] Falling back to default categories');
        return this.generateDefaultCategories(dto.businessType);
      }
    } catch (error) {
      console.error('[MenuService] ERROR calling AI for menu generation:', error);
      console.log('[MenuService] Falling back to default categories');
      return this.generateDefaultCategories(dto.businessType);
    }
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