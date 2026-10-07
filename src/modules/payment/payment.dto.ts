import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

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

export class CreateCheckoutDto {
  /** PlanItem id to subscribe to. */
  @IsString()
  planId: string;
}
