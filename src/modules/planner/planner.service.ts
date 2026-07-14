import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import {
  GenerateCalendarDto,
  CreateCalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './planner.dto';
import { Platform, EventStatus } from '@prisma/client';

@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async generateCalendar(userId: string, tenantId: string, dto: GenerateCalendarDto) {
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const days = dto.duration === 'WEEKLY' ? 7 : 30;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const calendar = await this.prisma.calendar.create({
      data: {
        name: dto.name,
        description: dto.description || `Content calendar for ${dto.topic}`,
        startDate,
        endDate,
        tenantId,
        userId,
      },
    });

    for (let i = 0; i < days; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + i);
      const platform = dto.platforms[i % dto.platforms.length];

      const content = await this.aiEngine.generateSocialPost({
        topic: dto.topic,
        platform,
        tone: dto.tone || 'professional',
      });

      await this.prisma.calendarEvent.create({
        data: {
          calendarId: calendar.id,
          title: `${dto.topic} - Day ${i + 1}`,
          description: content,
          platform: platform as Platform,
          scheduledAt: scheduledDate,
          status: EventStatus.SCHEDULED,
        },
      });
    }

    return this.prisma.calendar.findUnique({
      where: { id: calendar.id },
      include: { events: true },
    });
  }

  async createCalendar(userId: string, tenantId: string, dto: CreateCalendarDto) {
    return this.prisma.calendar.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        tenantId,
        userId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.calendar.findMany({
      where: { tenantId },
      include: { events: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const calendar = await this.prisma.calendar.findFirst({
      where: { id, tenantId },
      include: { events: true },
    });
    if (!calendar) throw new NotFoundException('Calendar not found');
    return calendar;
  }

  async addEvent(calendarId: string, tenantId: string, dto: CreateCalendarEventDto) {
    await this.findOne(calendarId, tenantId);
    return this.prisma.calendarEvent.create({
      data: {
        calendarId,
        title: dto.title,
        description: dto.description,
        platform: dto.platform as Platform,
        scheduledAt: new Date(dto.scheduledAt),
        status: (dto.status as EventStatus) || EventStatus.DRAFT,
      },
    });
  }

  async updateEvent(id: string, tenantId: string, dto: UpdateCalendarEventDto) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id },
    });
    if (!event) throw new NotFoundException('Calendar event not found');

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        platform: dto.platform as Platform,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.status as EventStatus,
      },
    });
  }

  async removeEvent(id: string, tenantId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.calendarEvent.deleteMany({ where: { calendarId: id } });
    return this.prisma.calendar.delete({ where: { id } });
  }
}
