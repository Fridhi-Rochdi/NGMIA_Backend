import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const CONTACT_SUBJECTS = ['question', 'offre-business', 'support', 'donnees', 'autre'] as const;

export class ContactDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty() @IsEmail({}, { message: 'Adresse e-mail invalide' }) @MaxLength(254) email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) company?: string;
  @ApiProperty({ enum: CONTACT_SUBJECTS }) @IsIn(CONTACT_SUBJECTS) subject!: (typeof CONTACT_SUBJECTS)[number];
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(5000) message!: string;
  /** Honeypot: hidden in the form, so only robots fill it. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;
}
