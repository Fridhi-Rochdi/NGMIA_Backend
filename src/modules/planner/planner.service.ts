import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { BusinessContextService } from '../business-context/business-context.service';
import { BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { renderBrandContext, resolveBrandContext } from '../../common/ai/brand-context';
import {
  GenerateCalendarDto,
  CreateCalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './planner.dto';
import { Platform, EventStatus } from '@prisma/client';
import { AutoPostService } from './auto-post.service';

/** Networks the publisher can actually post to. */
const AUTO_PUBLISHABLE = new Set<string>(['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER']);
/** Local time a generated post goes out: lunch break, when small-business audiences scroll. */
const POSTING_HOUR = 12;
const POSTING_MINUTE = 30;

/** Minutes east of UTC for `timeZone` at `at`; 0 for an unknown zone. */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/**
 * The instant that reads `hour:minute` on day `dayOffset` after `from`, in
 * `timeZone`. Generated posts used to inherit the time of generation, or
 * midnight UTC for a date-only start, so an armed calendar published at two
 * in the morning, local time.
 */
export function localPostingTime(
  from: Date,
  dayOffset: number,
  timeZone: string,
  hour = POSTING_HOUR,
  minute = POSTING_MINUTE,
): Date {
  const offset = zoneOffsetMinutes(timeZone, from);
  const local = new Date(from.getTime() + offset * 60000);
  const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour, minute);
  // Re-read the offset on the target day: a DST change may fall in between.
  return new Date(target - zoneOffsetMinutes(timeZone, new Date(target)) * 60000);
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly businessContext: BusinessContextService,
    private readonly autoPost: AutoPostService,
    private readonly brandKit: BrandKitService,
  ) {}

  async generateCalendar(userId: string, tenantId: string, dto: GenerateCalendarDto) {
    const context = await this.businessContext.find(tenantId);
    const timeZone = dto.timezone || process.env.DEFAULT_TIMEZONE || 'Europe/Paris';
    const requested = dto.startDate ? new Date(dto.startDate) : new Date();
    // The first post goes out on the start day only if its posting time is
    // still ahead; otherwise the calendar starts the next day. A post due in
    // the past would be published the moment the calendar is armed.
    const firstDay = localPostingTime(requested, 0, timeZone).getTime() > Date.now() ? 0 : 1;
    const startDate = localPostingTime(requested, firstDay, timeZone);
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

    // Write the posts a few at a time.
    //
    // This used to fire one generation per day through a single Promise.all —
    // thirty simultaneous calls for a monthly calendar. Two things went wrong
    // at once: the provider rate-limited the burst, and Promise.all rejects on
    // the first failure, so one bad day threw the whole month away and the
    // endpoint answered 500 with nothing saved.
    //
    // Now the batch is bounded, and a day that cannot be written is skipped
    // rather than fatal: a calendar with twenty-eight posts is worth far more
    // than an error.
    const kit = await this.brandKit.find(tenantId);
    const tone = dto.tone || context?.tone || 'professional';
    const brandContext = renderBrandContext(resolveBrandContext(kit, { tone }));

    // One angle per day, planned up front: the same prompt thirty times gave
    // thirty rewordings of one post. A failed plan is not fatal — the posts
    // are then written on the bare topic, as before.
    let angles: string[] = [];
    try {
      angles = await this.aiEngine.planCalendarAngles({
        topic: dto.topic,
        days,
        platforms: dto.platforms,
        brandContext,
      });
    } catch (error: any) {
      this.logger.warn(`Plan editorial indisponible: ${error?.message}`);
    }

    const CONCURRENCY = 3;
    const eventData: any[] = [];
    const failures: string[] = [];

    for (let start = 0; start < days; start += CONCURRENCY) {
      const batch = Array.from(
        { length: Math.min(CONCURRENCY, days - start) },
        (_, offset) => start + offset,
      );

      const written = await Promise.all(
        batch.map(async (i) => {
          const scheduledDate = localPostingTime(requested, firstDay + i, timeZone);
          const platform = dto.platforms[i % dto.platforms.length];

          try {
            const content = await this.aiEngine.generateSocialPost({
              topic: dto.topic,
              platform,
              tone,
              language: context?.language,
              // Without it the model invents a business to write about.
              brandContext,
              angle: angles[i],
            });

            return {
              calendarId: calendar.id,
              title: `${dto.topic} - Jour ${i + 1}`,
              description: content,
              platform: platform as Platform,
              scheduledAt: scheduledDate,
              status: EventStatus.SCHEDULED,
            };
          } catch (error: any) {
            failures.push(`jour ${i + 1}: ${error?.message}`);
            return null;
          }
        }),
      );

      eventData.push(...written.filter(Boolean));
    }

    if (!eventData.length) {
      // Nothing was written at all: an empty calendar would look like success.
      await this.prisma.calendar.delete({ where: { id: calendar.id } }).catch(() => undefined);
      throw new ServiceUnavailableException(
        `Aucun post n'a pu etre genere pour ce calendrier. ${failures[0] || ''}`.trim(),
      );
    }

    if (failures.length) {
      this.logger.warn(
        `Calendrier ${calendar.id}: ${eventData.length}/${days} posts ecrits, ` +
          `${failures.length} echec(s). Premier: ${failures[0]}`,
      );
    }

    // Bulk insert all events in a single DB call
    await this.prisma.calendarEvent.createMany({ data: eventData });

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

  /** List a calendar's events (ownership checked through findOne). */
  async findEvents(calendarId: string, tenantId: string) {
    await this.findOne(calendarId, tenantId);
    return this.prisma.calendarEvent.findMany({
      where: { calendarId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async addEvent(calendarId: string, tenantId: string, dto: CreateCalendarEventDto) {
    await this.findOne(calendarId, tenantId);
    if (dto.autoPublish && !AUTO_PUBLISHABLE.has(String(dto.platform))) {
      throw new BadRequestException(
        `La publication automatique n'est pas disponible pour ${dto.platform}: publiez ce post a la main.`,
      );
    }
    return this.prisma.calendarEvent.create({
      data: {
        calendarId,
        title: dto.title,
        description: dto.description,
        platform: dto.platform as Platform,
        scheduledAt: new Date(dto.scheduledAt),
        autoPublish: dto.autoPublish ?? false,
        // An armed post is scheduled by definition: a DRAFT is never picked up.
        status: dto.autoPublish ? EventStatus.SCHEDULED : (dto.status as EventStatus) || EventStatus.DRAFT,
      },
    });
  }

  async updateEvent(id: string, tenantId: string, dto: UpdateCalendarEventDto) {
    // Validate tenant ownership by joining through the calendar relation
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, calendar: { tenantId } },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    // A published post is a record of what went out; one being sent must not
    // change under the publisher's feet.
    if (event.status === EventStatus.PUBLISHED || event.status === EventStatus.PUBLISHING) {
      throw new BadRequestException(
        event.status === EventStatus.PUBLISHED
          ? 'Ce post est deja publie: modifiez-le directement sur le reseau.'
          : 'Ce post est en cours de publication. Reessayez dans une minute.',
      );
    }
    // Statuses the scheduler owns cannot be set by hand.
    if (dto.status === EventStatus.PUBLISHED || dto.status === EventStatus.PUBLISHING) {
      throw new BadRequestException('Ce statut est attribue par la publication, pas a la main.');
    }

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
    // Validate tenant ownership by joining through the calendar relation
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, calendar: { tenantId } },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.calendarEvent.deleteMany({ where: { calendarId: id } });
    return this.prisma.calendar.delete({ where: { id } });
  }
  // ============================================
  // Publication automatique
  // ============================================

  /** An event, but only if it belongs to this tenant. */
  private async ownedEvent(id: string, tenantId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, calendar: { tenantId } },
      include: { calendar: true },
    });
    if (!event) throw new NotFoundException('Evenement introuvable');
    return event;
  }

  /**
   * Publish one event immediately.
   *
   * Goes through AutoPostService so the manual path and the scheduled path are
   * the same code: the claim, the platform call, the recorded outcome.
   */
  async publishEventNow(id: string, tenantId: string) {
    const event = await this.ownedEvent(id, tenantId);

    // "Publish now" on a post that already went out published it a second
    // time: a double click was enough to put a duplicate on the page.
    if (event.status === EventStatus.PUBLISHED) {
      throw new BadRequestException('Ce post est deja publie.');
    }
    if (event.status === EventStatus.PUBLISHING) {
      throw new BadRequestException('Ce post est deja en cours de publication.');
    }

    // A failed event has to be put back in the queue
    // before it can be claimed, otherwise the claim finds nothing to do.
    if (event.status !== EventStatus.SCHEDULED) {
      await this.prisma.calendarEvent.update({
        where: { id },
        data: { status: EventStatus.SCHEDULED, attempts: 0, error: null },
      });
    }

    const outcome = await this.autoPost.publishOne(id);
    const after = await this.prisma.calendarEvent.findUnique({ where: { id } });
    return { outcome, status: after?.status, error: after?.error, externalId: after?.externalId };
  }

  /**
   * Arm or disarm one event.
   *
   * Arming also promotes a DRAFT to SCHEDULED. Turning automatic publishing on
   * is the owner saying "this should go out"; leaving it a draft would arm an
   * event the scheduler is never allowed to pick up, which reads as the
   * feature being broken. Disarming leaves the status alone — a post can be
   * scheduled and still meant to be sent by hand.
   */
  async setAutoPublish(id: string, tenantId: string, enabled: boolean) {
    const event = await this.ownedEvent(id, tenantId);
    if (enabled && !AUTO_PUBLISHABLE.has(String(event.platform))) {
      throw new BadRequestException(
        `La publication automatique n'est pas disponible pour ${event.platform}: publiez ce post a la main.`,
      );
    }
    const promote = enabled && event.status === EventStatus.DRAFT;

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        autoPublish: enabled,
        ...(promote ? { status: EventStatus.SCHEDULED } : {}),
      },
    });
  }

  async setCalendarAutoPublish(calendarId: string, tenantId: string, enabled: boolean) {
    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, tenantId },
    });
    if (!calendar) throw new NotFoundException('Calendrier introuvable');

    // Only what is still pending: arming a calendar must not resurrect posts
    // that already went out or that their owner cancelled.
    // Nor publish a backlog: arming a calendar whose first days are past
    // used to send every overdue post in the same minute. Those stay as they
    // are, to be rescheduled or sent by hand. Networks the publisher cannot
    // reach are left out too, or they would only collect failures.
    const updated = await this.prisma.calendarEvent.updateMany({
      where: {
        calendarId,
        status: { in: [EventStatus.SCHEDULED, EventStatus.DRAFT] },
        ...(enabled
          ? { scheduledAt: { gt: new Date() }, platform: { in: [...AUTO_PUBLISHABLE] as Platform[] } }
          : {}),
      },
      data: {
        autoPublish: enabled,
        // Same reasoning as the single-event case: arming a calendar means its
        // pending posts are meant to go out.
        ...(enabled ? { status: EventStatus.SCHEDULED } : {}),
      },
    });
    return { updated: updated.count, enabled };
  }

  /** The publishing picture for one calendar, per event and in summary. */
  async publishingStatus(calendarId: string, tenantId: string) {
    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, tenantId },
      include: { events: { orderBy: { scheduledAt: 'asc' } } },
    });
    if (!calendar) throw new NotFoundException('Calendrier introuvable');

    const counts: Record<string, number> = {};
    for (const e of calendar.events) counts[e.status] = (counts[e.status] || 0) + 1;

    return {
      calendarId,
      armed: calendar.events.filter((e) => e.autoPublish).length,
      total: calendar.events.length,
      counts,
      events: calendar.events.map((e) => ({
        id: e.id,
        title: e.title,
        platform: e.platform,
        scheduledAt: e.scheduledAt,
        status: e.status,
        autoPublish: e.autoPublish,
        publishedAt: e.publishedAt,
        externalId: e.externalId,
        attempts: e.attempts,
        error: e.error,
      })),
    };
  }

}
