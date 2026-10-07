import {
  IsUUID,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  IsOptional,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BUSINESS_TYPES } from '../business-context/business-context.dto';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  password: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ example: 'Mon Entreprise' })
  @IsString()
  @MaxLength(100)
  @MinLength(2, { message: 'Le nom du tenant doit contenir au moins 2 caractères' })
  tenantName: string;

  @ApiProperty({ example: 'mon-entreprise' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  tenantSlug: string;

  @ApiPropertyOptional({ example: 'Technology' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ example: 'We provide AI solutions for businesses' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Small business owners' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @ApiPropertyOptional({ example: 'Professional and innovative' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tone?: string;

  @ApiPropertyOptional({ enum: BUSINESS_TYPES, example: 'RESTAURANT' })
  @IsOptional()
  @IsIn(BUSINESS_TYPES as unknown as string[])
  businessType?: string;

  @ApiPropertyOptional({ type: [String], example: ['Escaliers sur mesure'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  services?: string[];

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsIn(['fr', 'en', 'es', 'ar', 'de'])
  language?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsIn(['EUR', 'USD', 'GBP', 'MAD', 'CAD', 'CHF', 'AED', 'SAR', 'TND'])
  currency?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ example: 'mon-entreprise' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  newPassword: string;
}

/**
 * Second step of login. The challenge id is what ties a code to an account —
 * the client never sees, and never sends, the user id.
 */
export class VerifyOtpDto {
  @ApiProperty({ example: '8f0b0f2c-1f3e-4b0c-9a11-1c2d3e4f5a6b' })
  @IsUUID()
  challengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir exactement 6 chiffres' })
  code: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: '8f0b0f2c-1f3e-4b0c-9a11-1c2d3e4f5a6b' })
  @IsUUID()
  challengeId: string;
}
