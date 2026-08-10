import { IsString, IsOptional, IsArray, ValidateNested, IsEnum, IsInt, Min, Max, IsNumber } from 'class-validator';
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

export class FontSizesDto {
  @IsNumber()
  @IsOptional()
  title?: number;

  @IsNumber()
  @IsOptional()
  category?: number;

  @IsNumber()
  @IsOptional()
  item?: number;

  @IsNumber()
  @IsOptional()
  description?: number;

  @IsNumber()
  @IsOptional()
  price?: number;
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

  @IsEnum(MenuBusinessType)
  businessType: MenuBusinessType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDto)
  @IsOptional()
  categories?: MenuCategoryDto[];

  @IsString()
  @IsOptional()
  template?: MenuTemplate;

  @ValidateNested()
  @Type(() => MenuColorsDto)
  @IsOptional()
  colors?: MenuColorsDto;

  @IsString()
  @IsOptional()
  fontFamily?: string;

  @ValidateNested()
  @Type(() => FontSizesDto)
  @IsOptional()
  fontSizes?: FontSizesDto;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  @Type(() => Number)
  pageCount?: number;
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
  template?: MenuTemplate;

  @ValidateNested()
  @Type(() => MenuColorsDto)
  @IsOptional()
  colors?: MenuColorsDto;

  @IsString()
  @IsOptional()
  fontFamily?: string;

  @ValidateNested()
  @Type(() => FontSizesDto)
  @IsOptional()
  fontSizes?: FontSizesDto;
}