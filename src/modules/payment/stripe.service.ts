import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe = require('stripe');

/**
 * Thin wrapper around the Stripe SDK.
 *
 * The secret key lives only here, read from the server environment. It is never
 * sent to the browser: checkout works by creating a session server-side and
 * handing the client a redirect URL, so no Stripe key of any kind reaches the
 * frontend.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  onModuleInit() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not set — payment endpoints will return 503.',
      );
      return;
    }
    if (key.startsWith('sk_live_')) {
      this.logger.warn('Stripe is running against a LIVE key.');
    }
    this.client = new Stripe(key, { apiVersion: '2025-10-29.clover' as any });
    this.logger.log(
      `Stripe ready (${key.startsWith('sk_test_') ? 'test/sandbox' : 'live'} mode)`,
    );
  }

  /** True when a secret key is configured. */
  get enabled(): boolean {
    return this.client !== null;
  }

  private get stripe(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Le paiement n'est pas configuré sur ce serveur (STRIPE_SECRET_KEY manquante).",
      );
    }
    return this.client;
  }

  /** Reuse one Stripe customer per tenant. */
  async ensureCustomer(params: {
    tenantId: string;
    tenantName: string;
    email?: string;
    existingCustomerId?: string | null;
  }): Promise<string> {
    if (params.existingCustomerId) {
      try {
        const found = await this.stripe.customers.retrieve(params.existingCustomerId);
        if (!(found as Stripe.DeletedCustomer).deleted) return params.existingCustomerId;
      } catch {
        this.logger.warn(
          `Stripe customer ${params.existingCustomerId} is gone; creating a new one.`,
        );
      }
    }

    const customer = await this.stripe.customers.create({
      name: params.tenantName,
      email: params.email,
      metadata: { tenantId: params.tenantId },
    });
    return customer.id;
  }

  /**
   * Find or create the recurring Price for a plan, so the catalogue in our
   * database stays the source of truth and Stripe objects are derived from it.
   */
  async ensurePrice(plan: {
    id: string;
    name: string;
    description?: string | null;
    amountCents: number;
    currency: string;
    interval: string;
    stripePriceId?: string | null;
  }): Promise<string> {
    if (plan.stripePriceId) {
      try {
        const price = await this.stripe.prices.retrieve(plan.stripePriceId);
        if (price.active) return price.id;
      } catch {
        this.logger.warn(`Stripe price ${plan.stripePriceId} is gone; recreating.`);
      }
    }

    const product = await this.stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      metadata: { planId: plan.id },
    });

    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: plan.amountCents,
      currency: plan.currency.toLowerCase(),
      recurring: { interval: plan.interval === 'year' ? 'year' : 'month' },
      metadata: { planId: plan.id },
    });

    this.logger.log(`Created Stripe price ${price.id} for plan "${plan.name}"`);
    return price.id;
  }

  /** Hosted Checkout session in subscription mode. */
  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    tenantId: string;
    planId: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: params.cancelUrl,
      // Echoed back on every webhook for this session, so we can attribute the
      // payment without trusting anything the client sends us.
      metadata: { tenantId: params.tenantId, planId: params.planId },
      subscription_data: {
        metadata: { tenantId: params.tenantId, planId: params.planId },
      },
    });
  }

  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
  }

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  /** Schedule cancellation at period end (keeps access until then). */
  async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  /** Stripe-hosted billing portal, so we never handle card details. */
  async createBillingPortalSession(customerId: string, returnUrl: string) {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Verify a webhook against the exact bytes Stripe signed. An unsigned or
   * mismatched payload is rejected: without this, anyone could POST a fake
   * "payment succeeded" event and upgrade themselves for free.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is not configured; webhooks are refused.',
      );
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error: any) {
      this.logger.warn(`Rejected webhook: ${error.message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }
  }
}
