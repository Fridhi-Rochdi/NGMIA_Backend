import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutDto } from './payment.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * Stripe webhook. Public by necessity — Stripe cannot send a JWT — but the
   * signature check in constructEvent() is what actually authenticates it.
   * Must stay above the guarded routes so no auth middleware touches it.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook (signature-verified, no JWT)' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const event = this.stripe.constructEvent(req.rawBody as Buffer, signature);
    const result = await this.billing.handleEvent(event);
    // Always 200 once the signature is valid, so Stripe stops retrying an event
    // we have deliberately chosen not to act on.
    return { received: true, type: event.type, handled: result.handled };
  }

  @UseGuards(TenantGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Plan, abonnement et factures du tenant courant' })
  overview(@CurrentTenant('id') tenantId: string) {
    return this.billing.getBillingOverview(tenantId);
  }

  @UseGuards(TenantGuard)
  @ApiBearerAuth()
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer une session Stripe Checkout et renvoyer son URL' })
  checkout(@CurrentTenant('id') tenantId: string, @Body() dto: CreateCheckoutDto) {
    return this.billing.createCheckoutSession(tenantId, dto.planId);
  }

  @UseGuards(TenantGuard)
  @ApiBearerAuth()
  @Get('checkout/:sessionId')
  @ApiOperation({ summary: "Statut d'une session de paiement (lecture seule)" })
  confirm(
    @CurrentTenant('id') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.billing.confirmCheckout(tenantId, sessionId);
  }

  @UseGuards(TenantGuard)
  @ApiBearerAuth()
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ouvrir le portail de facturation Stripe' })
  portal(@CurrentTenant('id') tenantId: string) {
    return this.billing.createPortalSession(tenantId);
  }

  @UseGuards(TenantGuard)
  @ApiBearerAuth()
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Annuler l'abonnement à la fin de la période" })
  cancel(@CurrentTenant('id') tenantId: string) {
    return this.billing.cancelAtPeriodEnd(tenantId);
  }
}
