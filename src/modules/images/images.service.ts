import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateImageDto, UpdateImageDto } from './images.dto';
import { ImageStatus } from '@prisma/client';

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async generateImage(userId: string, tenantId: string, dto: GenerateImageDto) {
    const sizeMap: Record<string, '256x256' | '512x512' | '1024x1024'> = {
      SQUARE: '512x512',
      LANDSCAPE: '1024x1024',
      PORTRAIT: '512x512',
    };

    const imageUrl = await this.aiEngine.generateImage({
      prompt: dto.prompt,
      size: sizeMap[dto.aspectRatio] || '512x512',
      style: dto.style || 'realistic',
    });

    return this.prisma.image.create({
      data: {
        prompt: dto.prompt,
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
}
