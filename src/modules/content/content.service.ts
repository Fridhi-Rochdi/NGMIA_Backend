import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { GenerateContentDto, UpdateContentDto } from './content.dto';
import { ContentType, ContentLength, ContentStatus } from '@prisma/client';

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async generateContent(userId: string, tenantId: string, dto: GenerateContentDto) {
    const generatedText = await this.aiEngine.generateText({
      prompt: dto.prompt,
      tone: dto.tone,
      length: dto.length,
    });

    return this.prisma.content.create({
      data: {
        title: dto.title,
        body: generatedText,
        type: (dto.type as ContentType) || ContentType.POST,
        tone: dto.tone || 'professional',
        length: (dto.length?.toUpperCase() as ContentLength) || ContentLength.MEDIUM,
        status: ContentStatus.GENERATED,
        prompt: dto.prompt,
        tenantId,
        userId,
      },
    });
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
