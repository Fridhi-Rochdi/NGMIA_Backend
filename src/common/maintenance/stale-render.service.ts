import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** A render running longer than this was abandoned (restart, crash, killed job). */
const STALE_AFTER_MS = 20 * 60 * 1000;

/**
 * Closes renders that will never finish.
 *
 * Image renders for menus and sites, and reel encodes, run in the background
 * of the process that started them. When that process stops — a deploy, a
 * crash, a dev-server reload — the row stays PENDING or RENDERING for good.
 * The list pages poll every few seconds while anything is rendering, so one
 * abandoned row kept every open tab hitting the API indefinitely, and the
 * owner saw a spinner that never ended.
 */
@Injectable()
export class StaleRenderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StaleRenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep().catch((error) => this.logger.warn(`Nettoyage des rendus: ${error?.message}`));
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<number> {
    const before = new Date(Date.now() - STALE_AFTER_MS);
    const rendering = { in: ['PENDING', 'RENDERING'] };

    const [menus, websites, reels] = await Promise.all([
      this.prisma.menu.updateMany({
        where: { visualStatus: rendering, updatedAt: { lt: before } },
        data: { visualStatus: 'FAILED' },
      }),
      this.prisma.website.updateMany({
        where: { visualStatus: rendering, updatedAt: { lt: before } },
        data: { visualStatus: 'FAILED' },
      }),
      this.prisma.reel.updateMany({
        where: { status: { in: ['PENDING', 'SCRIPTING', 'RENDERING', 'ENCODING'] }, updatedAt: { lt: before } },
        data: {
          status: 'FAILED',
          error: 'Le rendu a ete interrompu (redemarrage du serveur). Relancez la generation.',
        },
      }),
    ]);

    const total = menus.count + websites.count + reels.count;
    if (total) {
      this.logger.warn(
        `Rendus interrompus clotures: ${menus.count} menu(s), ${websites.count} site(s), ${reels.count} reel(s)`,
      );
    }
    return total;
  }
}
