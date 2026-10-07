import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Business types offered across the menu / poster / image modules. */
export const BUSINESS_TYPES = [
  'RESTAURANT',
  'CAFE',
  'BAR',
  'BAKERY',
  'PIZZERIA',
  'SUSHI',
  'FAST_FOOD',
  'BURGER',
  'ICE_CREAM',
  'RETAIL',
  'HEALTH',
  'EDUCATION',
  'REAL_ESTATE',
  'EVENT',
  'TECH',
  'SERVICES',
  'OTHER',
] as const;

export const TONES = [
  'professional',
  'casual',
  'friendly',
  'authoritative',
  'playful',
  'luxury',
] as const;

export class UpdateBusinessContextDto {
  @ApiPropertyOptional({ example: 'Atelier Vermeer' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName?: string;

  @ApiPropertyOptional({ enum: BUSINESS_TYPES })
  @IsOptional()
  @IsIn(BUSINESS_TYPES as unknown as string[])
  businessType?: string;

  @ApiPropertyOptional({ example: 'Menuiserie' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  services?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @ApiPropertyOptional({ enum: TONES })
  @IsOptional()
  @IsIn(TONES as unknown as string[])
  tone?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsIn(['fr', 'en', 'es', 'ar', 'de'])
  language?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsIn(['EUR', 'USD', 'GBP', 'MAD', 'CAD', 'CHF', 'AED', 'SAR', 'TND'])
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  contactAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;
}

/** Shape returned to clients and consumed internally by the generation modules. */
export class BusinessContextResponse {
  @ApiProperty() businessName: string;
  @ApiProperty() businessType: string;
  @ApiProperty({ nullable: true }) industry: string | null;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) services: string[];
  @ApiProperty({ nullable: true }) targetAudience: string | null;
  @ApiProperty() tone: string;
  @ApiProperty() language: string;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true }) contactPhone: string | null;
  @ApiProperty({ nullable: true }) contactEmail: string | null;
  @ApiProperty({ nullable: true }) contactAddress: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
}
