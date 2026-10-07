import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentStatus,
  EventStatus,
  ImageStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface Activity {
  id: string;
  type: 'content' | 'image' | 'website' | 'menu' | 'poster';
  action: string;
  title: string;
  status: string;
  createdAt: Date;
  href: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      tenant,
      totalContent,
      contentThisMonth,
      contentPreviousMonth,
      activeAccounts,
      accountsThisMonth,
      accountsPreviousMonth,
      scheduledEvents,
      eventsThisMonth,
      eventsPreviousMonth,
      totalImages,
      completedImages,
      failedImages,
      totalBrands,
      totalCalendars,
      totalWebsites,
      publishedWebsites,
      totalMenus,
      publishedMenus,
      totalPosters,
      publishedPosters,
      recentContent,
      recentImages,
      recentWebsites,
      recentMenus,
      recentPosters,
      upcomingEvents,
      contentTimeline,
      imageTimeline,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, plan: true },
      }),
      this.prisma.content.count({ where: { tenantId } }),
      this.prisma.content.count({
        where: { tenantId, createdAt: { gte: currentMonth } },
      }),
      this.prisma.content.count({
        where: {
          tenantId,
          createdAt: { gte: previousMonth, lt: currentMonth },
        },
      }),
      // An account whose token has expired cannot publish: it is not active.
      this.prisma.socialAccount.count({
        where: { tenantId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
      this.prisma.socialAccount.count({
        where: { tenantId, createdAt: { gte: currentMonth } },
      }),
      this.prisma.socialAccount.count({
        where: {
          tenantId,
          createdAt: { gte: previousMonth, lt: currentMonth },
        },
      }),
      // What will actually go out on its own. A generated calendar is
      // SCHEDULED but not armed, and counting it promised posts the
      // scheduler is not allowed to send.
      this.prisma.calendarEvent.count({
        where: {
          calendar: { tenantId },
          status: EventStatus.SCHEDULED,
          autoPublish: true,
          scheduledAt: { gte: now },
        },
      }),
      this.prisma.calendarEvent.count({
        where: {
          calendar: { tenantId },
          createdAt: { gte: currentMonth },
        },
      }),
      this.prisma.calendarEvent.count({
        where: {
          calendar: { tenantId },
          createdAt: { gte: previousMonth, lt: currentMonth },
        },
      }),
      this.prisma.image.count({ where: { tenantId } }),
      this.prisma.image.count({
        where: { tenantId, status: ImageStatus.COMPLETED },
      }),
      this.prisma.image.count({
        where: { tenantId, status: ImageStatus.FAILED },
      }),
      this.prisma.brand.count({ where: { tenantId } }),
      this.prisma.calendar.count({ where: { tenantId } }),
      this.prisma.website.count({ where: { tenantId } }),
      this.prisma.website.count({
        where: { tenantId, status: 'PUBLISHED' },
      }),
      this.prisma.menu.count({ where: { tenantId } }),
      this.prisma.menu.count({ where: { tenantId, status: 'PUBLISHED' } }),
      this.prisma.poster.count({ where: { tenantId } }),
      this.prisma.poster.count({
        where: { tenantId, status: 'PUBLISHED' },
      }),
      this.prisma.content.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          platform: true,
          type: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.image.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, prompt: true, status: true, createdAt: true },
      }),
      this.prisma.website.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          businessName: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.menu.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.prisma.poster.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      // Everything planned, armed or not: a post to publish by hand is still
      // on the owner's agenda.
      this.prisma.calendarEvent.findMany({
        where: {
          calendar: { tenantId },
          status: { in: [EventStatus.SCHEDULED, EventStatus.DRAFT] },
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: {
          id: true,
          title: true,
          platform: true,
          scheduledAt: true,
          autoPublish: true,
          calendar: { select: { id: true, name: true } },
        },
      }),
      this.prisma.content.findMany({
        where: { tenantId, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      this.prisma.image.findMany({
        where: { tenantId, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');

    const successfulOutputs =
      totalContent +
      completedImages +
      publishedWebsites +
      publishedMenus +
      publishedPosters;
    const attemptedOutputs =
      totalContent +
      totalImages +
      totalWebsites +
      totalMenus +
      totalPosters;
    const successRate =
      attemptedOutputs > 0
        ? Math.round((successfulOutputs / attemptedOutputs) * 100)
        : 0;

    const activities: Activity[] = [
      ...recentContent.map((item) => ({
        id: item.id,
        type: 'content' as const,
        action:
          item.status === ContentStatus.PUBLISHED ? 'Published' : 'Generated',
        title: item.title,
        status: item.status,
        createdAt: item.createdAt,
        href: '/content',
      })),
      ...recentImages.map((item) => ({
        id: item.id,
        type: 'image' as const,
        action: 'Created image',
        title: item.prompt,
        status: item.status,
        createdAt: item.createdAt,
        href: '/images',
      })),
      ...recentWebsites.map((item) => ({
        id: item.id,
        type: 'website' as const,
        action: 'Created website',
        title: item.businessName,
        status: item.status,
        createdAt: item.createdAt,
        href: '/websites',
      })),
      ...recentMenus.map((item) => ({
        id: item.id,
        type: 'menu' as const,
        action: 'Created menu',
        title: item.name,
        status: item.status,
        createdAt: item.createdAt,
        href: '/menu',
      })),
      ...recentPosters.map((item) => ({
        id: item.id,
        type: 'poster' as const,
        action: 'Created poster',
        title: item.title,
        status: item.status,
        createdAt: item.createdAt,
        href: '/poster',
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return {
      workspace: tenant,
      stats: {
        totalContent,
        activeAccounts,
        scheduledEvents,
        successRate,
        changes: {
          content: contentThisMonth - contentPreviousMonth,
          accounts: accountsThisMonth - accountsPreviousMonth,
          scheduled: eventsThisMonth - eventsPreviousMonth,
        },
      },
      resources: {
        brands: totalBrands,
        images: totalImages,
        calendars: totalCalendars,
        websites: totalWebsites,
        menus: totalMenus,
        posters: totalPosters,
      },
      health: {
        completedImages,
        failedImages,
        publishedWebsites,
        publishedMenus,
        publishedPosters,
      },
      recentContent,
      upcomingEvents,
      activities,
      analytics: this.buildTimeline(
        contentTimeline.map((item) => item.createdAt),
        imageTimeline.map((item) => item.createdAt),
        now,
      ),
      generatedAt: now,
    };
  }

  private buildTimeline(
    contentDates: Date[],
    imageDates: Date[],
    now: Date,
  ) {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return {
        month: date.toLocaleDateString('en', { month: 'short' }),
        content: contentDates.filter((item) => item >= date && item < next)
          .length,
        images: imageDates.filter((item) => item >= date && item < next)
          .length,
      };
    });
  }
}
