import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateBrandingDto {
  @ApiProperty()
  @IsString()
  brandName: string;

  @ApiProperty()
  @IsString()
  industry: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ['modern', 'classic', 'playful', 'luxurious', 'tech'], required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    const aliases: Record<string, string> = {
      luxury: 'luxurious',
      luxe: 'luxurious',
      professional: 'modern',
      professionnel: 'modern',
      elegant: 'luxurious',
      elegante: 'luxurious',
      élégant: 'luxurious',
      technologique: 'tech',
    };
    return aliases[normalized] || normalized;
  })
  @IsEnum(['modern', 'classic', 'playful', 'luxurious', 'tech'])
  style?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  values?: string[];
}

export class RegenerateLogoDto {
  @ApiProperty({ required: false, description: 'Description personnalisée pour guider la régénération du logo (en anglais recommandé)' })
  @IsOptional()
  @IsString()
  logoDescription?: string;
}

export class ModifyLogoDto {
  @ApiProperty({ required: false, description: 'Nouvelle description pour le logo (en anglais)' })
  @IsOptional()
  @IsString()
  logoDescription?: string;

  @ApiProperty({ required: false, description: 'Couleur primaire (hex)' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ required: false, description: 'Couleur secondaire (hex)' })
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiProperty({ required: false, description: 'Couleur d\'accent (hex)' })
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiProperty({ required: false, description: 'Style de design' })
  @IsOptional()
  @IsEnum(['modern', 'classic', 'playful', 'luxurious', 'tech'])
  style?: string;
}

export class UpdateBrandingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetAudience?: string;
}
