import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Plan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantAdminDto } from './admin.dto';

/**
 * Platform-wide operations for the admin console.
 *
 * Everything here deliberately crosses tenant boundaries, which is exactly why
 * every route that reaches it is behind SuperAdminGuard and never behind
 * TenantGuard. Treat any new method here as privileged by default.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      tenants,
      tenantsThisMonth,
      tenantsPrevMonth,
      activeTenants,
      users,
      activeSubs,
      pastDueSubs,
      paidInvoices,
      websites,
      publishedWebsites,
      menus,
      posters,
      images,
      contents,
      planBreakdown,
      signupTimeline,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.tenant.count({
        where: { createdAt: { gte: prevMonthStart, lt: monthStart } },
      }),
      this.prisma.tenant.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      this.prisma.invoice.findMany({
        where: { status: 'PAID' },
        select: { amount: true, currency: true, paidAt: true },
      }),
      this.prisma.website.count(),
      this.prisma.website.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.menu.count(),
      this.prisma.poster.count(),
      this.prisma.image.count(),
      this.prisma.content.count(),
      this.prisma.tenant.groupBy({ by: ['plan'], _count: { plan: true } }),
      this.prisma.tenant.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
    ]);

    // Invoices in different currencies cannot be added up: 29 EUR + 300 MAD
    // used to read as "329 EUR". The headline figure is the main currency;
    // every currency is also returned on its own.
    const byCurrency = new Map<string, { total: number; thisMonth: number }>();
    for (const invoice of paidInvoices) {
      const key = String(invoice.currency || 'EUR').toUpperCase();
      const row = byCurrency.get(key) || { total: 0, thisMonth: 0 };
      row.total += Number(invoice.amount);
      if (invoice.paidAt && invoice.paidAt >= monthStart) row.thisMonth += Number(invoice.amount);
      byCurrency.set(key, row);
    }
    const mainCurrency =
      [...byCurrency.entries()].sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'EUR';
    const revenueTotal = byCurrency.get(mainCurrency)?.total || 0;
    const revenueThisMonth = byCurrency.get(mainCurrency)?.thisMonth || 0;

    return {
      tenants: {
        total: tenants,
        active: activeTenants,
        thisMonth: tenantsThisMonth,
        change: tenantsThisMonth - tenantsPrevMonth,
      },
      users: { total: users },
      subscriptions: { active: activeSubs, pastDue: pastDueSubs },
      revenue: {
        total: Math.round(revenueTotal * 100) / 100,
        thisMonth: Math.round(revenueThisMonth * 100) / 100,
        currency: mainCurrency,
        byCurrency: [...byCurrency.entries()].map(([currency, r]) => ({
          currency,
          total: Math.round(r.total * 100) / 100,
          thisMonth: Math.round(r.thisMonth * 100) / 100,
        })),
      },
      production: {
        websites,
        publishedWebsites,
        menus,
        posters,
        images,
        contents,
      },
      planBreakdown: planBreakdown.map((p) => ({ plan: p.plan, count: p._count.plan })),
      signupTimeline: this.monthlyTimeline(
        signupTimeline.map((t) => t.createdAt),
        now,
      ),
      generatedAt: now,
    };
  }

  async listTenants(params: { search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const search = params.search?.trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { users: true, websites: true, menus: true, posters: true, images: true },
          },
          subscription: { include: { plan: true } },
          businessContext: { select: { businessName: true, businessType: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: rows.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isActive: t.isActive,
        createdAt: t.createdAt,
        businessName: t.businessContext?.businessName ?? null,
        businessType: t.businessContext?.businessType ?? null,
        subscriptionStatus: t.subscription?.status ?? null,
        subscriptionPlan: t.subscription?.plan?.name ?? null,
        counts: t._count,
      })),
    };
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        businessContext: true,
        subscription: { include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } } },
        _count: {
          select: { websites: true, menus: true, posters: true, images: true, contents: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant introuvable');

    // Never leak provider tokens through the admin API.
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      isActive: tenant.isActive,
      maxUsers: tenant.maxUsers,
      maxProjects: tenant.maxProjects,
      createdAt: tenant.createdAt,
      stripeCustomerId: tenant.stripeCustomerId,
      users: tenant.users,
      businessContext: tenant.businessContext,
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            planName: tenant.subscription.plan.name,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: tenant.subscription.cancelAtPeriodEnd,
            invoices: tenant.subscription.invoices.map((i) => ({
              id: i.id,
              amount: Number(i.amount),
              currency: i.currency,
              status: i.status,
              paidAt: i.paidAt,
            })),
          }
        : null,
      counts: tenant._count,
    };
  }

  async updateTenant(id: string, dto: UpdateTenantAdminDto, actorEmail: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant introuvable');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        isActive: dto.isActive ?? undefined,
        plan: (dto.plan as Plan) ?? undefined,
        maxUsers: dto.maxUsers ?? undefined,
        maxProjects: dto.maxProjects ?? undefined,
      },
    });

    // Privileged cross-tenant write: always leave a trace of who did it.
    this.logger.warn(
      `ADMIN ${actorEmail} updated tenant ${tenant.slug}: ${JSON.stringify(dto)}`,
    );
    return { id: updated.id, slug: updated.slug, plan: updated.plan, isActive: updated.isActive };
  }

  async listUsers(params: { search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const search = params.search?.trim();

    const where = search
      ? { email: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Explicit select: `password` must never reach the admin console.
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true, plan: true } },
        },
      }),
    ]);

    return { total, page, pageSize, items: rows };
  }

  async listSubscriptions() {
    const rows = await this.prisma.subscription.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        plan: true,
        tenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { invoices: true } },
      },
    });

    return rows.map((s) => ({
      id: s.id,
      tenant: s.tenant,
      planName: s.plan.name,
      price: Number(s.plan.price),
      currency: s.plan.currency,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      invoiceCount: s._count.invoices,
    }));
  }

  private monthlyTimeline(dates: Date[], now: Date) {
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        month: start.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        count: dates.filter((d) => d >= start && d < end).length,
      };
    });
  }
}
