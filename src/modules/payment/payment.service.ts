import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateInvoiceDto,
  CreatePaymentMethodDto,
  CheckoutSessionDto,
} from './payment.dto';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== PLANS ====================

  async findAllPlans() {
    return this.prisma.planItem.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async findPlanById(id: string) {
    const plan = await this.prisma.planItem.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.planItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency || 'EUR',
        interval: dto.interval || 'month',
        stripePriceId: dto.stripePriceId,
        features: (dto.features ?? {}) as any,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.findPlanById(id);
    return this.prisma.planItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency,
        interval: dto.interval,
        stripePriceId: dto.stripePriceId,
        features: (dto.features ?? {}) as any,
        isActive: dto.isActive,
      },
    });
  }

  async deletePlan(id: string) {
    await this.findPlanById(id);
    return this.prisma.planItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== SUBSCRIPTIONS ====================

  async findSubscriptionByTenant(tenantId: string) {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async createSubscription(tenantId: string, dto: CreateSubscriptionDto) {
    const plan = await this.findPlanById(dto.planId);
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (plan.interval === 'year' ? 12 : 1));

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId: dto.planId,
        stripeSubscriptionId: dto.stripeSubscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        status: 'ACTIVE',
      },
      include: { plan: true },
    });
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('Subscription not found');

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: dto.status,
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd,
      },
      include: { plan: true },
    });
  }

  async cancelSubscription(id: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('Subscription not found');

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelAtPeriodEnd: true,
      },
      include: { plan: true },
    });
  }

  // ==================== INVOICES ====================

  async findInvoicesByTenant(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: {
        subscription: { tenantId },
      },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
    });
  }

  async createInvoice(dto: CreateInvoiceDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: dto.subscriptionId },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    return this.prisma.invoice.create({
      data: {
        subscriptionId: dto.subscriptionId,
        amount: dto.amount,
        currency: dto.currency || 'EUR',
        status: 'PENDING',
      },
      include: { subscription: { include: { plan: true } } },
    });
  }

  // ==================== PAYMENT METHODS ====================

  async findPaymentMethodsByTenant(tenantId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { tenantId },
      orderBy: { isDefault: 'desc' },
    });
  }

  async createPaymentMethod(tenantId: string, dto: CreatePaymentMethodDto) {
    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }

    return this.prisma.paymentMethod.create({
      data: {
        tenantId,
        stripePaymentMethodId: dto.stripePaymentMethodId,
        type: dto.type || 'card',
        brand: dto.brand,
        last4: dto.last4,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        isDefault: dto.isDefault || false,
      },
    });
  }

  async setDefaultPaymentMethod(tenantId: string, id: string) {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, tenantId },
    });
    if (!method) throw new NotFoundException('Payment method not found');

    await this.prisma.paymentMethod.updateMany({
      where: { tenantId },
      data: { isDefault: false },
    });

    return this.prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async deletePaymentMethod(tenantId: string, id: string) {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, tenantId },
    });
    if (!method) throw new NotFoundException('Payment method not found');

    return this.prisma.paymentMethod.delete({ where: { id } });
  }

  // ==================== CHECKOUT ====================

  async createCheckoutSession(tenantId: string, dto: CheckoutSessionDto) {
    const plan = await this.findPlanById(dto.planId);

    // In a real implementation, you would integrate with Stripe here
    // For now, we return a mock session
    return {
      sessionId: `cs_${Date.now()}`,
      url: dto.successUrl || '/payment/success',
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
      },
    };
  }

  async getPaymentStatus(tenantId: string) {
    const subscription = await this.findSubscriptionByTenant(tenantId);
    const paymentMethods = await this.findPaymentMethodsByTenant(tenantId);

    return {
      subscription,
      paymentMethods,
      isActive: subscription?.status === 'ACTIVE',
    };
  }
}
