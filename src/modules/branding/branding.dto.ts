import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

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
  @IsEnum(['modern', 'classic', 'playful', 'luxurious', 'tech'])
  style?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  values?: string[];
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
