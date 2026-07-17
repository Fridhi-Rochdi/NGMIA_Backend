import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VercelDeploymentService } from './vercel-deployment.service';

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
  vercelUrl?: string;
  deploymentStatus?: string;
}

@Injectable()
export class WebsiteService {
  private readonly logger = new Logger(WebsiteService.name);

  constructor(
    private readonly aiEngineService: AiEngineService,
    private readonly prisma: PrismaService,
    private readonly vercelDeploymentService: VercelDeploymentService,
  ) {}

  async generateWebsite(dto: WebsiteGenerationDto, tenantId: string, userId: string): Promise<GeneratedWebsite> {
    const prompt = this.buildPrompt(dto);

    let html = '';
    let css = '';

    try {
      const aiResponse = await this.aiEngineService.generateWebsiteHtml({
        prompt,
        businessName: dto.businessName,
        template: dto.template || 'modern',
        colors: dto.colors,
      });
      const parsed = this.parseAiResponse(aiResponse);
      html = parsed.html;
      css = parsed.css;
    } catch (err) {
      this.logger.warn(`AI generation failed, using fallback template: ${err.message}`);
      const fallback = this.buildFallbackHtml(dto);
      html = fallback.html;
      css = fallback.css;
    }

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
        html,
        css,
        subdomain,
        status: 'DRAFT',
        tenantId,
        userId,
        deploymentStatus: 'NONE',
      },
    });

    return {
      id: website.id,
      subdomain: website.subdomain,
      html: website.html,
      css: website.css,
      previewUrl: `https://${subdomain}.vercel.app`,
      deploymentStatus: 'NONE',
    };
  }

  private buildPrompt(dto: WebsiteGenerationDto): string {
    const primaryColor = dto.colors?.primary || '#3b82f6';
    const secondaryColor = dto.colors?.secondary || '#1e3a8a';
    const accentColor = dto.colors?.accent || '#22c55e';

    return `Génère un site web vitrine professionnel COMPLET en HTML pour "${dto.businessName}".

Type d'entreprise: ${dto.businessType}
Description: ${dto.description}
${dto.services?.length ? `Services: ${dto.services.join(', ')}` : ''}
${dto.contactInfo?.phone ? `Téléphone: ${dto.contactInfo.phone}` : ''}
${dto.contactInfo?.email ? `Email: ${dto.contactInfo.email}` : ''}
${dto.contactInfo?.address ? `Adresse: ${dto.contactInfo.address}` : ''}
Couleur primaire: ${primaryColor}
Couleur secondaire: ${secondaryColor}
Couleur accent: ${accentColor}
Style template: ${dto.template || 'modern'}

INSTRUCTIONS STRICTES:
- Retourne UNIQUEMENT un document HTML complet valide commençant par <!DOCTYPE html>
- Inclure la balise <html lang="fr">, <head> avec charset, viewport, title, et <body>
- Utiliser Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Inclure Google Fonts Inter: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
- Créer un site COMPLET avec: Hero section, Services/Produits, A propos, Contact, Footer
- Utiliser les couleurs fournies comme couleurs principales du site
- Rendre le site responsive (mobile-first)
- Ajouter des animations CSS subtiles (hover effects, transitions)
- NE PAS inclure de JSON wrapper, retourner directement le HTML
- Le site doit être prêt à publier tel quel`;
  }

  private parseAiResponse(response: string): { html: string; css: string } {
    // Try JSON parse first (old format)
    try {
      const parsed = JSON.parse(response);
      if (parsed.html) {
        return { html: parsed.html, css: parsed.css || '' };
      }
    } catch {}

    // Extract HTML if it starts with <!DOCTYPE or <html
    const htmlMatch = response.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
    if (htmlMatch) {
      return { html: htmlMatch[1], css: '' };
    }

    // Return as-is
    return { html: response, css: '' };
  }

  private buildFallbackHtml(dto: WebsiteGenerationDto): { html: string; css: string } {
    const primaryColor = dto.colors?.primary || '#3b82f6';
    const accentColor = dto.colors?.accent || '#22c55e';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dto.businessName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, ${primaryColor}15, ${accentColor}10); }
    .hero-gradient { background: linear-gradient(135deg, ${primaryColor}, ${dto.colors?.secondary || '#1e3a8a'}); }
    .btn-primary { background-color: ${primaryColor}; }
    .btn-primary:hover { opacity: 0.9; }
    .accent { color: ${accentColor}; }
  </style>
</head>
<body class="bg-white text-gray-800">

  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
    <div class="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
      <div class="text-2xl font-bold" style="color: ${primaryColor}">${dto.businessName}</div>
      <div class="hidden md:flex gap-8 text-sm font-medium text-gray-600">
        <a href="#services" class="hover:text-blue-600 transition">Services</a>
        <a href="#about" class="hover:text-blue-600 transition">À propos</a>
        <a href="#contact" class="hover:text-blue-600 transition">Contact</a>
      </div>
      <a href="#contact" class="btn-primary text-white px-5 py-2 rounded-full text-sm font-semibold transition">Nous contacter</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero-gradient min-h-screen flex items-center justify-center text-white pt-20">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <h1 class="text-5xl md:text-7xl font-bold mb-6 leading-tight">${dto.businessName}</h1>
      <p class="text-xl md:text-2xl text-white/80 mb-4 font-light">${dto.businessType}</p>
      <p class="text-lg text-white/70 mb-10 max-w-2xl mx-auto">${dto.description}</p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="#contact" class="bg-white px-8 py-4 rounded-full font-semibold transition hover:shadow-xl" style="color: ${primaryColor}">Nous contacter</a>
        <a href="#services" class="border-2 border-white/50 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition">Découvrir nos services</a>
      </div>
    </div>
  </section>

  <!-- Services -->
  <section id="services" class="py-24 gradient-bg">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-bold text-gray-900 mb-4">Nos Services</h2>
        <p class="text-gray-500 text-lg max-w-2xl mx-auto">Des solutions adaptées à tous vos besoins</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        ${(dto.services && dto.services.length > 0 ? dto.services : ['Service Premium', 'Support Expert', 'Solutions Sur Mesure']).map((service, i) => `
        <div class="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-2xl" style="background: ${primaryColor}20">
            ${['⭐', '🚀', '💡', '🎯', '🔑', '✅'][i % 6]}
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-3">${service}</h3>
          <p class="text-gray-500 leading-relaxed">Une approche professionnelle et personnalisée pour répondre à vos attentes.</p>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- About -->
  <section id="about" class="py-24 bg-white">
    <div class="max-w-6xl mx-auto px-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 class="text-4xl font-bold text-gray-900 mb-6">À propos de nous</h2>
          <p class="text-gray-500 text-lg leading-relaxed mb-8">${dto.description}</p>
          <div class="grid grid-cols-2 gap-6">
            <div class="text-center p-6 rounded-2xl" style="background: ${primaryColor}10">
              <div class="text-3xl font-bold mb-2" style="color: ${primaryColor}">10+</div>
              <div class="text-gray-500 text-sm">Ans d'expérience</div>
            </div>
            <div class="text-center p-6 rounded-2xl" style="background: ${accentColor}10">
              <div class="text-3xl font-bold mb-2" style="color: ${accentColor}">500+</div>
              <div class="text-gray-500 text-sm">Clients satisfaits</div>
            </div>
          </div>
        </div>
        <div class="rounded-3xl overflow-hidden h-80 flex items-center justify-center" style="background: linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)">
          <div class="text-center p-8">
            <div class="text-6xl mb-4">🏢</div>
            <div class="text-xl font-semibold text-gray-700">${dto.businessName}</div>
            <div class="text-gray-500">${dto.businessType}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Contact -->
  <section id="contact" class="py-24 hero-gradient text-white">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <h2 class="text-4xl font-bold mb-6">Contactez-nous</h2>
      <p class="text-white/70 text-lg mb-12">Nous sommes à votre disposition pour répondre à toutes vos questions</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        ${dto.contactInfo?.phone ? `<div class="bg-white/10 backdrop-blur rounded-2xl p-6"><div class="text-3xl mb-3">📞</div><div class="font-semibold mb-1">Téléphone</div><div class="text-white/70">${dto.contactInfo.phone}</div></div>` : ''}
        ${dto.contactInfo?.email ? `<div class="bg-white/10 backdrop-blur rounded-2xl p-6"><div class="text-3xl mb-3">📧</div><div class="font-semibold mb-1">Email</div><div class="text-white/70">${dto.contactInfo.email}</div></div>` : ''}
        ${dto.contactInfo?.address ? `<div class="bg-white/10 backdrop-blur rounded-2xl p-6"><div class="text-3xl mb-3">📍</div><div class="font-semibold mb-1">Adresse</div><div class="text-white/70">${dto.contactInfo.address}</div></div>` : ''}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-white py-12">
    <div class="max-w-6xl mx-auto px-6 text-center">
      <div class="text-2xl font-bold mb-4" style="color: ${primaryColor}">${dto.businessName}</div>
      <p class="text-gray-400 mb-6">${dto.description.substring(0, 100)}...</p>
      <div class="border-t border-gray-800 pt-6 text-gray-500 text-sm">
        © ${new Date().getFullYear()} ${dto.businessName}. Tous droits réservés. Propulsé par NextGen MarketingAI.
      </div>
    </div>
  </footer>

  <script>
    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  </script>
</body>
</html>`;

    return { html, css: '' };
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
      previewUrl: (website as any).vercelUrl || `https://${website.subdomain}.vercel.app`,
      publishedAt: website.publishedAt || undefined,
      vercelUrl: (website as any).vercelUrl || undefined,
      deploymentStatus: (website as any).deploymentStatus || 'NONE',
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
      previewUrl: (website as any).vercelUrl || `https://${website.subdomain}.vercel.app`,
      publishedAt: website.publishedAt || undefined,
      vercelUrl: (website as any).vercelUrl || undefined,
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
      previewUrl: (w as any).vercelUrl || `https://${w.subdomain}.vercel.app`,
      publishedAt: w.publishedAt || undefined,
      vercelUrl: (w as any).vercelUrl || undefined,
      deploymentStatus: (w as any).deploymentStatus || 'NONE',
    }));
  }

  async publishWebsite(id: string): Promise<{ publishedUrl: string; deploymentId?: string; status: string }> {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException('Website not found');

    this.logger.log(`Publishing website ${id} to Vercel...`);

    try {
      const result = await this.vercelDeploymentService.deployWebsite(
        website.subdomain,
        website.html,
        website.css,
        website.businessName,
      );

      await this.prisma.website.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          ...(({ vercelProjectId: result.projectId, vercelDeploymentId: result.deploymentId, vercelUrl: result.url, deploymentStatus: result.status }) as any),
        },
      });

      return {
        publishedUrl: result.url,
        deploymentId: result.deploymentId,
        status: result.status,
      };
    } catch (error) {
      this.logger.error(`Vercel deployment failed: ${error.message}`);
      // Fallback: mark as published without real URL
      await this.prisma.website.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      throw error;
    }
  }

  async getDeploymentStatus(id: string): Promise<{ status: string; url?: string }> {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException('Website not found');

    const deploymentId = (website as any).vercelDeploymentId;
    if (!deploymentId) {
      return { status: (website as any).deploymentStatus || 'NONE' };
    }

    const status = await this.vercelDeploymentService.getDeploymentStatus(deploymentId);

    if (status.status === 'READY' && status.url) {
      await this.prisma.website.update({
        where: { id },
        data: { ...(({ vercelUrl: status.url, deploymentStatus: 'READY' }) as any) },
      });
    }

    return status;
  }
}
