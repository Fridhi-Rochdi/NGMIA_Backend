import { Injectable, NotFoundException } from '@nestjs/common';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface WebsiteGenerationDto {
  businessName: string;
  businessType: string;
  description: string;
  services?: string[];
  contactInfo?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  template?: 'modern' | 'classic' | 'minimal' | 'bold';
}

export interface GeneratedWebsite {
  id: string;
  subdomain: string;
  html: string;
  css: string;
  previewUrl: string;
  publishedAt?: Date;
}

@Injectable()
export class WebsiteService {
  constructor(
    private readonly aiEngineService: AiEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async generateWebsite(dto: WebsiteGenerationDto, tenantId: string, userId: string): Promise<GeneratedWebsite> {
    const prompt = this.buildPrompt(dto);
    const aiResponse = await this.aiEngineService.generateText({
      prompt,
      tone: 'professional',
      language: 'fr',
    });

    const websiteData = this.parseAiResponse(aiResponse);
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
        primaryColor: dto.colors?.primary || '#3b82f6',
        secondaryColor: dto.colors?.secondary || '#1e3a8a',
        accentColor: dto.colors?.accent || '#22c55e',
        template: dto.template || 'modern',
        html: websiteData.html,
        css: websiteData.css,
        subdomain,
        status: 'DRAFT',
        tenantId,
        userId,
      },
    });

    return {
      id: website.id,
      subdomain: website.subdomain,
      html: website.html,
      css: website.css,
      previewUrl: `https://${subdomain}.maketingai.dev`,
    };
  }

  private buildPrompt(dto: WebsiteGenerationDto): string {
    return `Génère un site web vitrine professionnel en HTML et CSS pour ${dto.businessName}.
Type d'entreprise: ${dto.businessType}
Description: ${dto.description}
${dto.services?.length ? `Services: ${dto.services.join(', ')}` : ''}
${dto.contactInfo?.phone ? `Téléphone: ${dto.contactInfo.phone}` : ''}
${dto.contactInfo?.email ? `Email: ${dto.contactInfo.email}` : ''}
${dto.contactInfo?.address ? `Adresse: ${dto.contactInfo.address}` : ''}
${dto.colors ? `Couleurs: Primaire ${dto.colors.primary}, Secondaire ${dto.colors.secondary}` : ''}
Template: ${dto.template || 'modern'}

Réponds uniquement au format JSON avec:
{
  "html": "code HTML complet avec Tailwind CSS",
  "css": "styles CSS additionnels si nécessaire"
}`;
  }

  private parseAiResponse(response: string): { html: string; css: string } {
    try {
      const parsed = JSON.parse(response);
      return {
        html: parsed.html || response,
        css: parsed.css || '',
      };
    } catch {
      return {
        html: response,
        css: '',
      };
    }
  }

  private generateSubdomain(businessName: string): string {
    const normalized = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${normalized}-${randomSuffix}`;
  }

  async getWebsite(id: string): Promise<GeneratedWebsite | null> {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) return null;
    return {
      id: website.id,
      subdomain: website.subdomain,
      html: website.html,
      css: website.css,
      previewUrl: `https://${website.subdomain}.maketingai.dev`,
      publishedAt: website.publishedAt || undefined,
    };
  }

  async getWebsiteBySubdomain(subdomain: string): Promise<GeneratedWebsite> {
    const website = await this.prisma.website.findUnique({ where: { subdomain } });
    if (!website || website.status !== 'PUBLISHED') {
      throw new NotFoundException('Website not found or not published');
    }
    return {
      id: website.id,
      subdomain: website.subdomain,
      html: website.html,
      css: website.css,
      previewUrl: `https://${website.subdomain}.maketingai.dev`,
      publishedAt: website.publishedAt || undefined,
    };
  }

  async listWebsites(tenantId: string): Promise<GeneratedWebsite[]> {
    const websites = await this.prisma.website.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return websites.map((w) => ({
      id: w.id,
      subdomain: w.subdomain,
      html: w.html,
      css: w.css,
      previewUrl: `https://${w.subdomain}.maketingai.dev`,
      publishedAt: w.publishedAt || undefined,
    }));
  }

  async publishWebsite(id: string): Promise<{ publishedUrl: string }> {
    const website = await this.prisma.website.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    return {
      publishedUrl: `https://${website.subdomain}.maketingai.dev`,
    };
  }
}