import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ImageBusinessType {
  RESTAURANT = 'RESTAURANT',
  CAFE = 'CAFE',
  BAR = 'BAR',
  BAKERY = 'BAKERY',
  PIZZERIA = 'PIZZERIA',
  SUSHI = 'SUSHI',
  FAST_FOOD = 'FAST_FOOD',
  BURGER = 'BURGER',
  ICE_CREAM = 'ICE_CREAM',
  RETAIL = 'RETAIL',
  HEALTH = 'HEALTH',
  EDUCATION = 'EDUCATION',
  REAL_ESTATE = 'REAL_ESTATE',
  EVENT = 'EVENT',
  TECH = 'TECH',
  OTHER = 'OTHER',
}

export enum ImageTemplate {
  MODERN = 'modern',
  CLASSIC = 'classic',
  MINIMAL = 'minimal',
  BOLD = 'bold',
  ELEGANT = 'elegant',
  RUSTIC = 'rustic',
}

export class ImageColorsDto {
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

export class GenerateImageDto {
  @ApiProperty({ description: 'Business name for context' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiProperty({ enum: ImageBusinessType })
  @IsOptional()
  @IsEnum(ImageBusinessType)
  businessType?: ImageBusinessType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ImageTemplate, required: false })
  @IsOptional()
  @IsEnum(ImageTemplate)
  template?: ImageTemplate;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ImageColorsDto)
  colors?: ImageColorsDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiProperty({ required: false, description: 'Custom prompt override (optional, AI generates one if not provided)' })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({ enum: ['SQUARE', 'LANDSCAPE', 'PORTRAIT'], required: false })
  @IsOptional()
  @IsEnum(['SQUARE', 'LANDSCAPE', 'PORTRAIT'])
  aspectRatio?: string;

  @ApiProperty({ enum: ['realistic', 'artistic', 'minimalist', 'vintage', 'bold'], required: false })
  @IsOptional()
  @IsEnum(['realistic', 'artistic', 'minimalist', 'vintage', 'bold'])
  style?: string;
}

export class UpdateImageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({ enum: ['PENDING', 'GENERATING', 'COMPLETED', 'FAILED'], required: false })
  @IsOptional()
  @IsEnum(['PENDING', 'GENERATING', 'COMPLETED', 'FAILED'])
  status?: string;
}
