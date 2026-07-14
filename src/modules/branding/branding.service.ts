import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateBrandingDto, UpdateBrandingDto } from './branding.dto';

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async generateBranding(userId: string, tenantId: string, dto: GenerateBrandingDto) {
    const branding = await this.aiEngine.generateBranding({
      brandName: dto.brandName,
      industry: dto.industry,
      description: dto.description,
      style: dto.style || 'modern',
      values: dto.values,
    });

    const slug = dto.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return this.prisma.brand.create({
      data: {
        name: dto.brandName,
        slug,
        tagline: branding.tagline,
        description: branding.description,
        tone: dto.style || 'professional',
        industry: dto.industry,
        primaryColor: branding.colorPalette.split(', ')[0] || '#3b82f6',
        secondaryColor: branding.colorPalette.split(', ')[1] || '#1e3a8a',
        accentColor: branding.colorPalette.split(', ')[2] || '#22c55e',
        fontFamily: branding.typography.split(', ')[0] || 'Inter',
        tenantId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, tenantId },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async update(id: string, tenantId: string, dto: UpdateBrandingDto) {
    await this.findOne(id, tenantId);
    return this.prisma.brand.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.brand.delete({ where: { id } });
  }
}
