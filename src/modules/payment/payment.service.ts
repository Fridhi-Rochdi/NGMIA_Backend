import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './payment.dto';

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
        features: (dto.features || {}) as any,
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
        features: dto.features as any,
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

  // ==================== PAYMENT METHODS ====================

  async findPaymentMethodsByTenant(tenantId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { tenantId },
      orderBy: { isDefault: 'desc' },
    });
  }

  // ==================== STATUS ====================

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
