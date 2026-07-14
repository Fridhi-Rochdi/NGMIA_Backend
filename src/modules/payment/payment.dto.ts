import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsDecimal, Min } from 'class-validator';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  PAST_DUE = 'PAST_DUE',
  UNPAID = 'UNPAID',
  TRIALING = 'TRIALING',
}

export enum InvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  interval?: string;

  @IsString()
  @IsOptional()
  stripePriceId?: string;

  @IsOptional()
  features?: Record<string, unknown>;
}

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  interval?: string;

  @IsString()
  @IsOptional()
  stripePriceId?: string;

  @IsOptional()
  features?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateSubscriptionDto {
  @IsString()
  planId: string;

  @IsString()
  @IsOptional()
  stripeSubscriptionId?: string;
}

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @IsBoolean()
  @IsOptional()
  cancelAtPeriodEnd?: boolean;
}

export class CreateInvoiceDto {
  @IsString()
  subscriptionId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class CreatePaymentMethodDto {
  @IsString()
  stripePaymentMethodId: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  last4?: string;

  @IsNumber()
  @IsOptional()
  expMonth?: number;

  @IsNumber()
  @IsOptional()
  expYear?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class CheckoutSessionDto {
  @IsString()
  planId: string;

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;
}
