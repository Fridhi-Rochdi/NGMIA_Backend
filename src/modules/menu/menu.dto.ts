import { IsString, IsOptional, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum MenuBusinessType {
  RESTAURANT = 'RESTAURANT',
  CAFE = 'CAFE',
  BAR = 'BAR',
  BAKERY = 'BAKERY',
  PIZZERIA = 'PIZZERIA',
  SUSHI = 'SUSHI',
  FAST_FOOD = 'FAST_FOOD',
  ICE_CREAM = 'ICE_CREAM',
  FOOD_TRUCK = 'FOOD_TRUCK',
  OTHER = 'OTHER',
}

export enum MenuTemplate {
  MODERN = 'modern',
  CLASSIC = 'classic',
  MINIMAL = 'minimal',
  ELEGANT = 'elegant',
  RUSTIC = 'rustic',
}

export class MenuItemDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  price: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class MenuCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items: MenuItemDto[];
}

export class MenuColorsDto {
  @IsString()
  @IsOptional()
  primary?: string;

  @IsString()
  @IsOptional()
  secondary?: string;

  @IsString()
  @IsOptional()
  accent?: string;
}

export class MenuGenerationDto {
  @IsString()
  businessName: string;

  @IsString()
  businessType: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  images?: { url: string; name: string }[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDto)
  @IsOptional()
  categories?: MenuCategoryDto[];

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
}

export class MenuUpdateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDto)
  @IsOptional()
  categories?: MenuCategoryDto[];

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
}