import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventStatus, Platform } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PermanentPublishError,
  SocialPublisherService,
} from '../social/social-publisher.service';
import { absoluteAssetUrl } from '../../common/app-url';
import { SocialOAuthService } from '../social/social-oauth.service';

/** Give up after this many tries; the event then waits for a human. */
const MAX_ATTEMPTS = 3;
/**
 * A claimed event still PUBLISHING after this long was abandoned mid-run (a
 * restart, a crash). Whether the platform received it is unknown.
 */
const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Publishes scheduled posts when they come due.
 *
 * This is the piece the editorial calendar never had. Events carried a
 * `scheduledAt` and a `status`, and nothing anywhere read them: a calendar was
 * a list of intentions that someone still had to copy into each network by
 * hand. "Auto post" was a column in a table.
 *
 * Three rules shape it:
 *
 *  - Opt in, never by default. `autoPublish` is false unless the owner turns
 *    it on, per event. Nobody should discover that a draft reached their
 *    audience because a scheduler existed.
 *  - Claim before publishing. An event is moved to PUBLISHING in a conditional
 *    update before any network call, so two instances — or a restart mid-run —
 *    cannot post the same thing twice. Duplicates on someone's feed are not
 *    recoverable.
 *  - Fail loudly, on the row. A refused post records the platform's own words
 *    and stops; it does not vanish into a log the tenant never reads.
 */
@Injectable()
export class AutoPostService {
  private readonly logger = new Logger(AutoPostService.name);
  /** Guards against a slow run overlapping the next tick in one process. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: SocialPublisherService,
    private readonly oauth: SocialOAuthService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (process.env.AUTO_POST_ENABLED === 'false') return;
    if (this.running) {
      this.logger.warn('Passe precedente encore en cours; tick ignore.');
      return;
    }
    this.running = true;
    try {
      await this.releaseStaleClaims();
      await this.publishDue();
    } catch (error: any) {
      this.logger.error(`Passe de publication echouee: ${error?.message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Events left in PUBLISHING by a run that never finished.
   *
   * The claim protects against double posting, but a process that dies after
   * claiming left the row PUBLISHING forever: the post never went out and the
   * calendar showed it as in progress for good. They are not re-queued: the
   * network may have received the post before the crash, and a duplicate on
   * someone's feed is worse than asking the owner to check.
   */
  async releaseStaleClaims(): Promise<number> {
    const released = await this.prisma.calendarEvent.updateMany({
      where: {
        status: EventStatus.PUBLISHING,
        updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
      },
      data: {
        status: EventStatus.FAILED,
        error:
          "Publication interrompue en cours d'envoi. Verifiez sur le reseau si le post est en ligne " +
          'avant de relancer, pour eviter un doublon.',
      },
    });
    if (released.count) this.logger.warn(`${released.count} publication(s) interrompue(s) liberee(s)`);
    return released.count;
  }

  /** Everything due, oldest first, in a bounded batch. */
  async publishDue(limit = 20): Promise<{ published: number; failed: number }> {
    const due = await this.prisma.calendarEvent.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        autoPublish: true,
        scheduledAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
        platform: { not: null },
        // A suspended account keeps its calendar, but nothing more goes out
        // in its name until it is reactivated.
        calendar: { tenant: { isActive: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      include: { calendar: true },
    });

    let published = 0;
    let failed = 0;

    for (const event of due) {
      const outcome = await this.publishOne(event.id);
      if (outcome === 'published') published += 1;
      else if (outcome === 'failed') failed += 1;
    }

    if (published || failed) {
      this.logger.log(`Publication automatique: ${published} publie(s), ${failed} echec(s)`);
    }
    return { published, failed };
  }

  /**
   * Publish one event.
   *
   * Exposed so the UI can offer "publish now" and "retry" through exactly the
   * same path the scheduler uses — a manual publish that took a different code
   * path would be a second implementation to keep correct.
   */
  async publishOne(eventId: string): Promise<'published' | 'failed' | 'skipped'> {
    // Claim it. The `status: SCHEDULED` in the WHERE is the lock: whoever
    // flips the row first wins, and a second worker updates nothing.
    const claimed = await this.prisma.calendarEvent.updateMany({
      where: { id: eventId, status: EventStatus.SCHEDULED },
      data: { status: EventStatus.PUBLISHING },
    });
    if (claimed.count === 0) return 'skipped';

    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: { calendar: true },
    });
    if (!event) return 'skipped';

    try {
      let account = await this.prisma.socialAccount.findFirst({
        where: {
          tenantId: event.calendar.tenantId,
          platform: event.platform as Platform,
          isActive: true,
        },
      });
      if (!account) {
        throw new PermanentPublishError(
          `Aucun compte ${event.platform} connecte. Connectez-le dans Reseaux sociaux, puis relancez.`,
        );
      }

      account = await this.freshToken(account);

      const text = (event.description || event.title || '').trim();
      if (!text) {
        throw new PermanentPublishError("L'evenement n'a aucun texte a publier.");
      }

      // The platform fetches the image itself, so it needs an absolute URL.
      const image = event.imageId ? await this.imageUrl(event.imageId) : null;

      const result = await this.publisher.publish(account, text, image);

      await this.prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: EventStatus.PUBLISHED,
          publishedAt: new Date(),
          externalId: result.externalId,
          error: null,
          attempts: { increment: 1 },
        },
      });
      this.logger.log(
        `Evenement ${eventId} publie sur ${event.platform} (${result.externalId})`,
      );
      return 'published';
    } catch (error: any) {
      const permanent = error instanceof PermanentPublishError;
      const attempts = event.attempts + 1;
      const exhausted = permanent || attempts >= MAX_ATTEMPTS;

      await this.prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          // A transient failure goes back in the queue; a refusal does not.
          status: exhausted ? EventStatus.FAILED : EventStatus.SCHEDULED,
          attempts,
          error: String(error?.message || error).slice(0, 500),
        },
      });

      this.logger.error(
        `Evenement ${eventId} (${event.platform}) ${exhausted ? 'abandonne' : `tentative ${attempts}/${MAX_ATTEMPTS}`}: ${error?.message}`,
      );
      return exhausted ? 'failed' : 'skipped';
    }
  }

  /**
   * Renew a token that has expired or is about to, when the platform allows
   * it (X: two-hour tokens with a refresh token). Others are left to the
   * publisher, which reports the expiry with a "reconnect" message.
   */
  private async freshToken<T extends { id: string; platform: Platform; refreshToken: string | null; expiresAt: Date | null }>(
    account: T,
  ): Promise<T> {
    const soon = Date.now() + 5 * 60 * 1000;
    if (account.platform !== 'TWITTER' || !account.refreshToken) return account;
    if (account.expiresAt && account.expiresAt.getTime() > soon) return account;
    try {
      const renewed = await this.oauth.refreshTwitter(account.refreshToken);
      return (await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: renewed.accessToken,
          refreshToken: renewed.refreshToken,
          expiresAt: renewed.expiresAt ?? null,
        },
      })) as unknown as T;
    } catch (error: any) {
      throw new PermanentPublishError(`${error?.message}. Reconnectez le compte X.`);
    }
  }

  /** Absolute, public URL of a stored image, or null when there is none. */
  private async imageUrl(imageId: string): Promise<string | null> {
    const image = await this.prisma.image.findUnique({ where: { id: imageId } });
    if (!image?.url) return null;
    // Base64 payloads cannot be handed to a platform that fetches by URL.
    if (image.url.startsWith('data:')) return null;
    return absoluteAssetUrl(image.url);
  }
}
