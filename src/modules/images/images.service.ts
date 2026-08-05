import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateImageDto, UpdateImageDto, ImageBusinessType, ImageTemplate } from './images.dto';
import { ImageStatus } from '@prisma/client';

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async createFromUpload(userId: string, tenantId: string, url: string, filename: string) {
    return this.prisma.image.create({
      data: {
        prompt: filename,
        businessName: null,
        businessType: null,
        url,
        style: 'uploaded',
        status: ImageStatus.COMPLETED,
        tenantId,
        userId,
      },
    });
  }

  async generateImage(userId: string, tenantId: string, dto: GenerateImageDto) {
    console.log('===========================================');
    console.log('[ImagesService] generateImage() called');
    console.log('[ImagesService] dto:', JSON.stringify(dto, null, 2));
    console.log('[ImagesService] tenantId:', tenantId);
    console.log('[ImagesService] userId:', userId);
    console.log('===========================================');

    const sizeMap: Record<string, '256x256' | '512x512' | '1024x1024'> = {
      SQUARE: '512x512',
      LANDSCAPE: '1024x1024',
      PORTRAIT: '512x512',
    };

    // Step 1: Generate enhanced prompt via AI (if not provided by user)
    let finalPrompt = dto.prompt || '';
    let enhancedPrompt: string | null = null;

    if (!finalPrompt || finalPrompt.trim().length === 0) {
      console.log('[ImagesService] No custom prompt provided, generating with AI...');
      try {
        enhancedPrompt = await this.generatePromptWithAI(dto);
        finalPrompt = enhancedPrompt;
        console.log('[ImagesService] AI generated prompt:', finalPrompt);
      } catch (error) {
        console.error('[ImagesService] AI prompt generation failed:', error);
        enhancedPrompt = this.generateDefaultPrompt(dto.businessType, dto.template || ImageTemplate.MODERN);
        finalPrompt = enhancedPrompt;
        console.log('[ImagesService] Using fallback prompt:', finalPrompt);
      }
    } else {
      console.log('[ImagesService] Using user-provided prompt:', finalPrompt);
    }

    // Step 2: Generate the actual image
    console.log('[ImagesService] Calling aiEngine.generateImage()...');
    const imageUrl = await this.aiEngine.generateImage({
      prompt: finalPrompt,
      size: sizeMap[dto.aspectRatio || 'SQUARE'] || '512x512',
      style: dto.style || 'realistic',
    });

    // Step 3: Store with full context
    return this.prisma.image.create({
      data: {
        prompt: dto.prompt || finalPrompt,
        businessName: dto.businessName,
        businessType: dto.businessType,
        description: dto.description || null,
        template: dto.template || ImageTemplate.MODERN,
        primaryColor: dto.colors?.primary || '#3b82f6',
        secondaryColor: dto.colors?.secondary || '#1e3a8a',
        accentColor: dto.colors?.accent || '#22c55e',
        fontFamily: dto.fontFamily || 'Inter',
        enhancedPrompt: enhancedPrompt,
        url: imageUrl,
        style: dto.style || 'realistic',
        status: ImageStatus.COMPLETED,
        tenantId,
        userId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.image.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const image = await this.prisma.image.findFirst({
      where: { id, tenantId },
    });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  async update(id: string, tenantId: string, dto: UpdateImageDto) {
    await this.findOne(id, tenantId);
    return this.prisma.image.update({
      where: { id },
      data: {
        prompt: dto.prompt,
        status: dto.status as ImageStatus,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.image.delete({ where: { id } });
  }

  // ==================== AI Prompt Generation (same logic as menu) ====================

  private async generatePromptWithAI(dto: GenerateImageDto): Promise<string> {
    console.log('[ImagesService] generatePromptWithAI() started');
    console.log('[ImagesService] businessType:', dto.businessType);
    console.log('[ImagesService] businessName:', dto.businessName);

    const businessTypeLabels: Record<ImageBusinessType, string> = {
      [ImageBusinessType.RESTAURANT]: 'restaurant gastronomique',
      [ImageBusinessType.CAFE]: 'café chaleureux',
      [ImageBusinessType.BAR]: 'bar lounge',
      [ImageBusinessType.BAKERY]: 'boulangerie artisanale',
      [ImageBusinessType.PIZZERIA]: 'pizzeria italienne',
      [ImageBusinessType.SUSHI]: 'restaurant japonais',
      [ImageBusinessType.FAST_FOOD]: 'fast-food moderne',
      [ImageBusinessType.BURGER]: 'burger gourmet',
      [ImageBusinessType.ICE_CREAM]: 'glacier artisanal',
      [ImageBusinessType.RETAIL]: 'boutique de vente',
      [ImageBusinessType.HEALTH]: 'centre santé/bien-être',
      [ImageBusinessType.EDUCATION]: 'établissement éducatif',
      [ImageBusinessType.REAL_ESTATE]: 'agence immobilière',
      [ImageBusinessType.EVENT]: 'événementiel',
      [ImageBusinessType.TECH]: 'entreprise tech',
      [ImageBusinessType.OTHER]: 'entreprise',
    };

    const templateStyles: Record<ImageTemplate, string> = {
      [ImageTemplate.MODERN]: 'moderne, épuré, professionnel, haute qualité',
      [ImageTemplate.CLASSIC]: 'classique, intemporel, élégant, traditionnel',
      [ImageTemplate.MINIMAL]: 'minimaliste, clean, beaucoup d\'espace négatif, design épuré',
      [ImageTemplate.BOLD]: 'audacieux, couleurs vives, impactant, dynamique',
      [ImageTemplate.ELEGANT]: 'luxueux, sophistiqué, premium, doré/noir',
      [ImageTemplate.RUSTIC]: 'artisanal, chaleureux, bois, textures naturelles',
    };

    const businessTypeLabel = businessTypeLabels[dto.businessType] || 'entreprise';
    const templateStyle = templateStyles[dto.template || ImageTemplate.MODERN];
    const colors = dto.colors || { primary: '#3b82f6', secondary: '#1e3a8a', accent: '#22c55e' };
    const description = dto.description || '';

    const prompt = `Tu es un expert en création de prompts pour génération d'images marketing avec DALL-E / Stable Diffusion.

Génère un prompt optimisé en anglais (pour l'API d'image) pour un ${businessTypeLabel} nommé "${dto.businessName}".
${description ? `Description de l'établissement: ${description}` : ''}

Contexte visuel:
- Style: ${templateStyle}
- Palette de couleurs: primaire ${colors.primary}, secondaire ${colors.secondary}, accent ${colors.accent}
- Police: ${dto.fontFamily || 'Inter'}

Le prompt doit:
1. Être en anglais (obligatoire pour l'API d'image)
2. Décrire une scène marketing attractive pour ce business
3. Inclure des détails sur l'éclairage, la composition, l'ambiance
4. Mentionner le style visuel et les couleurs
5. Faire entre 50 et 150 mots
6. Être optimisé pour générer une image de haute qualité

Réponds UNIQUEMENT avec le prompt en anglais, sans texte avant ou après.`;

    console.log('[ImagesService] Prompt enhancer sent to LLM');
    
    const response = await this.aiEngine.generateText({
      prompt,
      tone: 'professionnel',
      length: 'complet',
      language: 'français',
    });

    console.log('[ImagesService] LLM response:', response);
    
    // Clean the response
    const cleaned = response.trim().replace(/^["']|["']$/g, '');
    return cleaned || this.generateDefaultPrompt(dto.businessType, dto.template || ImageTemplate.MODERN);
  }

  private generateDefaultPrompt(businessType: ImageBusinessType, template: ImageTemplate): string {
    const templateStyle = {
      [ImageTemplate.MODERN]: 'modern, clean, professional',
      [ImageTemplate.CLASSIC]: 'classic, timeless, elegant',
      [ImageTemplate.MINIMAL]: 'minimalist, lots of negative space, clean design',
      [ImageTemplate.BOLD]: 'bold colors, dynamic, eye-catching',
      [ImageTemplate.ELEGANT]: 'luxurious, sophisticated, premium, gold accents',
      [ImageTemplate.RUSTIC]: 'artisanal, warm, wood textures, natural',
    }[template] || 'modern, professional';

    const businessPrompts: Record<ImageBusinessType, string> = {
      [ImageBusinessType.RESTAURANT]: `Elegant restaurant interior with warm lighting, beautifully plated gourmet dishes on wooden tables, ${templateStyle} photography style, shallow depth of field, 4K quality`,
      [ImageBusinessType.CAFE]: `Cozy cafe interior with natural light, steaming coffee cups, barista at work, ${templateStyle} style, warm tones, inviting atmosphere`,
      [ImageBusinessType.BAR]: `Sophisticated bar with ambient lighting, crafted cocktails on marble counter, ${templateStyle} mood, bokeh background, high-end photography`,
      [ImageBusinessType.BAKERY]: `Artisan bakery display with fresh bread and pastries, golden morning light, ${templateStyle} aesthetic, flour-dusted surfaces`,
      [ImageBusinessType.PIZZERIA]: `Authentic Italian pizzeria with wood-fired oven, fresh pizza on rustic table, ${templateStyle}, steam rising, warm colors`,
      [ImageBusinessType.SUSHI]: `Elegant Japanese restaurant, artfully arranged sushi platter, ${templateStyle}, minimalist presentation, soft lighting`,
      [ImageBusinessType.FAST_FOOD]: `Vibrant fast-food restaurant, perfectly styled burgers and fries, ${templateStyle}, bold colors, appetizing shot`,
      [ImageBusinessType.BURGER]: `Gourmet burger with melting cheese, fresh ingredients, ${templateStyle} food photography, dramatic lighting, 4K`,
      [ImageBusinessType.ICE_CREAM]: `Artisanal ice cream shop, colorful scoops in waffle cones, ${templateStyle}, summer vibes, natural light`,
      [ImageBusinessType.RETAIL]: `Modern retail store interior, beautifully arranged products on shelves, ${templateStyle}, bright lighting, inviting display`,
      [ImageBusinessType.HEALTH]: `Serene wellness center, natural elements, ${templateStyle}, soft lighting, plants, calming atmosphere`,
      [ImageBusinessType.EDUCATION]: `Modern educational space, bright and inspiring, ${templateStyle}, natural light, collaborative environment`,
      [ImageBusinessType.REAL_ESTATE]: `Luxurious property exterior, ${templateStyle} real estate photography, golden hour lighting, wide angle, premium`,
      [ImageBusinessType.EVENT]: `Elegant event setup with ambient lighting, ${templateStyle}, beautifully decorated tables, celebration atmosphere`,
      [ImageBusinessType.TECH]: `Cutting-edge tech office, ${templateStyle}, blue and white tones, futuristic yet warm, innovation vibe`,
      [ImageBusinessType.OTHER]: `Professional business marketing image, ${templateStyle}, high quality, corporate aesthetic, 4K`,
    };

    return businessPrompts[businessType] || businessPrompts[ImageBusinessType.OTHER];
  }
}
