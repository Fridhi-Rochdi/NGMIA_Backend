import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CreatePlanDto, UpdatePlanDto } from './payment.dto';

/**
 * Read-only view of a tenant's billing, plus the plan catalogue.
 *
 * Every state change to a subscription goes through /billing (Stripe checkout,
 * signed webhook, customer portal). The routes that used to live here —
 * creating an ACTIVE subscription, editing or cancelling one by id, issuing
 * invoices, a mock checkout — bypassed payment entirely and were not scoped to
 * the caller's tenant, so they were removed rather than patched.
 */
@ApiTags('Payment')
@ApiBearerAuth()
@Controller('payment')
@UseGuards(TenantGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ==================== PLANS ====================

  @Get('plans')
  async findAllPlans() {
    return this.paymentService.findAllPlans();
  }

  @Get('plans/:id')
  async findPlanById(@Param('id') id: string) {
    return this.paymentService.findPlanById(id);
  }

  // The catalogue is platform-wide: only the platform operator edits it.
  @Post('plans')
  @UseGuards(SuperAdminGuard)
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Put('plans/:id')
  @UseGuards(SuperAdminGuard)
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.paymentService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @UseGuards(SuperAdminGuard)
  async deletePlan(@Param('id') id: string) {
    return this.paymentService.deletePlan(id);
  }

  // ==================== TENANT (read-only) ====================

  @Get('subscription')
  async findSubscription(@CurrentTenant('id') tenantId: string) {
    return this.paymentService.findSubscriptionByTenant(tenantId);
  }

  @Get('invoices')
  async findInvoices(@CurrentTenant('id') tenantId: string) {
    return this.paymentService.findInvoicesByTenant(tenantId);
  }

  @Get('payment-methods')
  async findPaymentMethods(@CurrentTenant('id') tenantId: string) {
    return this.paymentService.findPaymentMethodsByTenant(tenantId);
  }

  @Get('status')
  async getPaymentStatus(@CurrentTenant('id') tenantId: string) {
    return this.paymentService.getPaymentStatus(tenantId);
  }
}
