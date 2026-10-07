import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Plan, SubscriptionStatus } from '@prisma/client';
import Stripe = require('stripe');
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';

/** Plan name -> tenant entitlement tier. */
const PLAN_TIER: Record<string, Plan> = {
  Essentiel: 'STARTER',
  Pro: 'PRO',
  Business: 'ENTERPRISE',
  // Retired names, kept so subscriptions taken under them still resolve.
  Starter: 'STARTER',
  Growth: 'PRO',
  Professional: 'PRO',
  Enterprise: 'ENTERPRISE',
};

/**
 * Owns the money workflow: checkout -> Stripe -> webhook -> subscription status.
 *
 * Entitlements are only ever granted from a *verified webhook*, never from the
 * browser returning to the success URL — a user can forge that redirect.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // ---------------------------------------------------------------- checkout

  async createCheckoutSession(tenantId: string, planId: string) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { users: { where: { role: 'OWNER' }, take: 1 } },
      }),
      this.prisma.planItem.findUnique({ where: { id: planId } }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant introuvable');
    if (!plan || !plan.isActive) throw new NotFoundException('Offre introuvable');

    const customerId = await this.stripe.ensureCustomer({
      tenantId,
      tenantName: tenant.name,
      email: tenant.users[0]?.email,
      existingCustomerId: tenant.stripeCustomerId,
    });
    if (customerId !== tenant.stripeCustomerId) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId = await this.stripe.ensurePrice({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      amountCents: Math.round(Number(plan.price) * 100),
      currency: plan.currency,
      interval: plan.interval,
      stripePriceId: plan.stripePriceId,
    });
    if (priceId !== plan.stripePriceId) {
      await this.prisma.planItem.update({
        where: { id: plan.id },
        data: { stripePriceId: priceId },
      });
    }

    const appUrl = (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')[0]
      .replace(/\/$/, '');

    const session = await this.stripe.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${appUrl}/settings/billing/success`,
      cancelUrl: `${appUrl}/settings?tab=billing&checkout=cancelled`,
      tenantId,
      planId: plan.id,
    });

    this.logger.log(`Checkout session ${session.id} for tenant ${tenantId}`);
    return { sessionId: session.id, url: session.url, planName: plan.name };
  }

  /**
   * Read-only confirmation for the success page. Deliberately does NOT grant
   * anything — it only reports what Stripe says, while the webhook does the
   * actual state change.
   */
  async confirmCheckout(tenantId: string, sessionId: string) {
    const session = await this.stripe.retrieveSession(sessionId);

    if (session.metadata?.tenantId !== tenantId) {
      throw new BadRequestException("Cette session de paiement n'appartient pas à votre compte.");
    }

    const paid = session.payment_status === 'paid';
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    return {
      paymentStatus: session.payment_status,
      paid,
      // May still be false for a beat: the webhook can land after the redirect.
      provisioned: !!subscription && subscription.status === SubscriptionStatus.ACTIVE,
      planName: subscription?.plan?.name ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  }

  async getBillingOverview(tenantId: string) {
    const [tenant, subscription, invoices] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
      this.prisma.invoice.findMany({
        where: { subscription: { tenantId } },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    return {
      plan: tenant?.plan ?? 'FREE',
      stripeConfigured: this.stripe.enabled,
      subscription: subscription
        ? {
            status: subscription.status,
            planName: subscription.plan.name,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        amount: Number(i.amount),
        currency: i.currency,
        status: i.status,
        paidAt: i.paidAt,
        invoiceUrl: i.invoiceUrl,
        createdAt: i.createdAt,
      })),
    };
  }

  async cancelAtPeriodEnd(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription?.stripeSubscriptionId) {
      throw new NotFoundException('Aucun abonnement actif à annuler.');
    }
    await this.stripe.cancelSubscriptionAtPeriodEnd(subscription.stripeSubscriptionId);
    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: { cancelAtPeriodEnd: true },
    });
    return { cancelAtPeriodEnd: updated.cancelAtPeriodEnd };
  }

  async createPortalSession(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.stripeCustomerId) {
      throw new NotFoundException('Aucun client Stripe pour ce compte.');
    }
    const appUrl = (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')[0]
      .replace(/\/$/, '');
    const session = await this.stripe.createBillingPortalSession(
      tenant.stripeCustomerId,
      `${appUrl}/settings?tab=billing`,
    );
    return { url: session.url };
  }

  // ---------------------------------------------------------------- webhooks

  /** Apply a verified Stripe event. Unknown types are acknowledged and ignored. */
  async handleEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        return { handled: true };

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(event.data.object as Stripe.Subscription);
        return { handled: true };

      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.onInvoice(event.data.object as Stripe.Invoice, event.type);
        return { handled: true };

      default:
        this.logger.debug(`Ignoring Stripe event ${event.type}`);
        return { handled: false };
    }
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planId = session.metadata?.planId;
    if (!tenantId || !planId) {
      this.logger.warn(`checkout.session.completed without metadata (${session.id})`);
      return;
    }
    if (session.payment_status !== 'paid') {
      this.logger.warn(`checkout ${session.id} completed but unpaid; no provisioning.`);
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      this.logger.warn(`checkout ${session.id} has no subscription`);
      return;
    }

    const stripeSub = await this.stripe.retrieveSubscription(subscriptionId);
    const { start, end } = this.periodOf(stripeSub);
    const plan = await this.prisma.planItem.findUnique({ where: { id: planId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId,
          stripeSubscriptionId: subscriptionId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        },
        update: {
          planId,
          stripeSubscriptionId: subscriptionId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        },
      });

      // Entitlement tier follows the purchased plan.
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: PLAN_TIER[plan?.name ?? ''] ?? 'STARTER' },
      });
    });

    this.logger.log(`Tenant ${tenantId} provisioned on plan "${plan?.name}"`);
  }

  private async onSubscriptionChanged(stripeSub: Stripe.Subscription) {
    const tenantId = stripeSub.metadata?.tenantId;
    if (!tenantId) return;

    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!existing) return;

    const { start, end } = this.periodOf(stripeSub);
    const status = this.mapStatus(stripeSub.status);

    await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        status,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
      },
    });

    // Losing the subscription drops the tenant back to FREE.
    if (status === SubscriptionStatus.CANCELLED || status === SubscriptionStatus.UNPAID) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan: 'FREE' } });
      this.logger.log(`Tenant ${tenantId} downgraded to FREE (${stripeSub.status})`);
    }
  }

  private async onInvoice(invoice: Stripe.Invoice, eventType: string) {
    const subscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;
    if (!subscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!subscription) return;

    const paid = eventType === 'invoice.paid';
    const stripeInvoiceId = invoice.id;

    const existing = stripeInvoiceId
      ? await this.prisma.invoice.findFirst({ where: { stripeInvoiceId } })
      : null;

    const data = {
      amount: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      currency: (invoice.currency || 'eur').toUpperCase(),
      status: paid ? InvoiceStatus.PAID : InvoiceStatus.FAILED,
      paidAt: paid ? new Date() : null,
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      stripeInvoiceId,
      subscriptionId: subscription.id,
    };

    // Stripe retries webhooks, so the same invoice can arrive more than once.
    if (existing) {
      await this.prisma.invoice.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.invoice.create({ data });
    }

    if (!paid) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.PAST_DUE },
      });
      this.logger.warn(`Invoice failed for subscription ${subscription.id}; marked PAST_DUE`);
    }
  }

  // ---------------------------------------------------------------- helpers

  private periodOf(sub: Stripe.Subscription): { start: Date; end: Date } {
    const item: any = sub.items?.data?.[0];
    const startSec = (sub as any).current_period_start ?? item?.current_period_start;
    const endSec = (sub as any).current_period_end ?? item?.current_period_end;
    const now = new Date();
    return {
      start: startSec ? new Date(startSec * 1000) : now,
      end: endSec
        ? new Date(endSec * 1000)
        : new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    };
  }

  private mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'canceled':
      case 'incomplete_expired':
        return SubscriptionStatus.CANCELLED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}
