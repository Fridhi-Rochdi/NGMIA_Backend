import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Monthly AI credits per plan. -1 means unlimited. Overridable per env.
 *
 * One credit is priced to about one generated image (~0.05 USD of model cost),
 * so the worst case for every plan stays well under its price. See PRICING.md
 * for the cost model behind these numbers. No plan is unlimited: image
 * generation has a real marginal cost, and "unlimited" on the pricing page
 * was a promise the platform could not afford to keep.
 */
const DEFAULT_LIMITS: Record<Plan, number> = {
  FREE: 30,
  STARTER: 200,
  PRO: 500,
  ENTERPRISE: 1200,
};

export interface AiUsageSummary {
  plan: Plan;
  used: number;
  /** -1 when the plan is unlimited. */
  limit: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Per-tenant monthly allowance of AI generations.
 *
 * Every generation spends the platform's own model credits (NVIDIA, image
 * models, ffmpeg time). Without this, a FREE account could loop the most
 * expensive endpoints indefinitely — and a paid plan bought nothing concrete.
 */
@Injectable()
export class AiQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  limitFor(plan: Plan): number {
    const raw = process.env[`AI_QUOTA_${plan}`];
    const parsed = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
    return Number.isInteger(parsed) ? parsed : DEFAULT_LIMITS[plan];
  }

  private static period(now = new Date()): { start: Date; end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  async summary(tenantId: string): Promise<AiUsageSummary> {
    const { start, end } = AiQuotaService.period();
    const [tenant, used] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } }),
      this.prisma.aiUsage.aggregate({
        where: { tenantId, createdAt: { gte: start } },
        _sum: { credits: true },
      }),
    ]);
    return {
      plan: tenant.plan,
      used: used._sum.credits ?? 0,
      limit: this.limitFor(tenant.plan),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    };
  }

  /**
   * Record `credits` against the tenant, or refuse with 402 if that would
   * exceed the plan. Check and insert happen under a per-tenant advisory lock,
   * so parallel requests cannot all slip under the limit at once.
   * Returns the usage row id, to refund with release() if the work fails.
   */
  async reserve(
    tenantId: string,
    userId: string | undefined,
    feature: string,
    credits: number,
  ): Promise<string> {
    const { start } = AiQuotaService.period();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true },
      });
      const limit = this.limitFor(tenant.plan);

      if (limit >= 0) {
        const agg = await tx.aiUsage.aggregate({
          where: { tenantId, createdAt: { gte: start } },
          _sum: { credits: true },
        });
        const used = agg._sum.credits ?? 0;
        if (used + credits > limit) {
          throw new HttpException(
            {
              message:
                `Quota IA mensuel atteint (${used}/${limit} crédits, offre ${tenant.plan}). ` +
                `Cette génération en demande ${credits}. Passez à une offre supérieure ou attendez le mois prochain.`,
              error: 'AI_QUOTA_EXCEEDED',
              used,
              limit,
              required: credits,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      const row = await tx.aiUsage.create({
        data: { tenantId, userId, feature, credits },
        select: { id: true },
      });
      return row.id;
    });
  }

  /** Refund a reservation whose generation failed. */
  async release(usageId: string): Promise<void> {
    await this.prisma.aiUsage.deleteMany({ where: { id: usageId } });
  }
}
