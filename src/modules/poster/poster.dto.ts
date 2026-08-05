import { IsString, IsOptional, IsEnum, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PosterBusinessType {
  RESTAURANT = 'RESTAURANT',
  RETAIL = 'RETAIL',
  EVENT = 'EVENT',
  PROMOTION = 'PROMOTION',
  FOOD = 'FOOD',
  BEAUTY = 'BEAUTY',
  FITNESS = 'FITNESS',
  OTHER = 'OTHER',
}

export enum PosterTemplate {
  MODERN = 'modern',
  CLASSIC = 'classic',
  MINIMAL = 'minimal',
  BOLD = 'bold',
  ELEGANT = 'elegant',
}

export enum PosterSize {
  A4 = 'A4',
  A3 = 'A3',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  STORY = 'STORY',
  // Frontend-compatible values
  SQUARE = 'SQUARE',
  PORTRAIT = 'PORTRAIT',
  LANDSCAPE = 'LANDSCAPE',
}

export class PosterColorsDto {
  @IsString()
  @IsOptional()
  primary?: string;

  @IsString()
  @IsOptional()
  secondary?: string;

  @IsString()
  @IsOptional()
  accent?: string;

  @IsString()
  @IsOptional()
  background?: string;

  @IsString()
  @IsOptional()
  text?: string;
}

export class PosterItemDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  image?: string;
}

export class PosterSectionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsArray()
  @IsOptional()
  items?: any[];
}

export class PosterGenerationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  businessName: string;

  @IsString()
  businessType: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosterSectionDto)
  @IsOptional()
  sections?: PosterSectionDto[];

  @IsString()
  @IsOptional()
  template?: string;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsString()
  @IsOptional()
  fontFamily?: string;

  @IsObject()
  @IsOptional()
  fontSizes?: Record<string, number>;

  @IsString()
  @IsOptional()
  size?: string;
}

export class PosterUpdateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  businessType?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosterSectionDto)
  @IsOptional()
  sections?: PosterSectionDto[];

  @IsString()
  @IsOptional()
  template?: string;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsString()
  @IsOptional()
  fontFamily?: string;

  @IsObject()
  @IsOptional()
  fontSizes?: Record<string, number>;

  @IsString()
  @IsOptional()
  size?: string;
}
