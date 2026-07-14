import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateInvoiceDto,
  CreatePaymentMethodDto,
  CheckoutSessionDto,
} from './payment.dto';

@Controller('payment')
@UseGuards(JwtAuthGuard, TenantGuard)
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

  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Put('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.paymentService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  async deletePlan(@Param('id') id: string) {
    return this.paymentService.deletePlan(id);
  }

  // ==================== SUBSCRIPTIONS ====================

  @Get('subscription')
  async findSubscription(@Request() req) {
    return this.paymentService.findSubscriptionByTenant(req.tenantId);
  }

  @Post('subscription')
  async createSubscription(@Request() req, @Body() dto: CreateSubscriptionDto) {
    return this.paymentService.createSubscription(req.tenantId, dto);
  }

  @Put('subscription/:id')
  async updateSubscription(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.paymentService.updateSubscription(id, dto);
  }

  @Delete('subscription/:id')
  async cancelSubscription(@Param('id') id: string) {
    return this.paymentService.cancelSubscription(id);
  }

  // ==================== INVOICES ====================

  @Get('invoices')
  async findInvoices(@Request() req) {
    return this.paymentService.findInvoicesByTenant(req.tenantId);
  }

  @Post('invoices')
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.paymentService.createInvoice(dto);
  }

  // ==================== PAYMENT METHODS ====================

  @Get('payment-methods')
  async findPaymentMethods(@Request() req) {
    return this.paymentService.findPaymentMethodsByTenant(req.tenantId);
  }

  @Post('payment-methods')
  async createPaymentMethod(@Request() req, @Body() dto: CreatePaymentMethodDto) {
    return this.paymentService.createPaymentMethod(req.tenantId, dto);
  }

  @Put('payment-methods/:id/default')
  async setDefaultPaymentMethod(@Request() req, @Param('id') id: string) {
    return this.paymentService.setDefaultPaymentMethod(req.tenantId, id);
  }

  @Delete('payment-methods/:id')
  async deletePaymentMethod(@Request() req, @Param('id') id: string) {
    return this.paymentService.deletePaymentMethod(req.tenantId, id);
  }

  // ==================== CHECKOUT ====================

  @Post('checkout')
  async createCheckoutSession(@Request() req, @Body() dto: CheckoutSessionDto) {
    return this.paymentService.createCheckoutSession(req.tenantId, dto);
  }

  @Get('status')
  async getPaymentStatus(@Request() req) {
    return this.paymentService.getPaymentStatus(req.tenantId);
  }
}
