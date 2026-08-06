import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean } from 'class-validator';

export class GenerateContentDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  prompt: string;

  @ApiProperty({ enum: ['POST', 'BLOG', 'AD', 'EMAIL', 'SLOGAN', 'DESCRIPTION'], required: false })
  @IsOptional()
  @IsEnum(['POST', 'BLOG', 'AD', 'EMAIL', 'SLOGAN', 'DESCRIPTION'])
  type?: string;

  @ApiProperty({ enum: ['professional', 'casual', 'friendly', 'authoritative', 'playful'], required: false })
  @IsOptional()
  @IsEnum(['professional', 'casual', 'friendly', 'authoritative', 'playful'])
  tone?: string;

  @ApiProperty({ enum: ['SHORT', 'MEDIUM', 'LONG'], required: false })
  @IsOptional()
  @IsEnum(['SHORT', 'MEDIUM', 'LONG'])
  length?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  keywords?: string[];

  @ApiProperty({ required: false, description: 'Ask AI to generate a matching image for this content' })
  @IsOptional()
  @IsBoolean()
  generateImage?: boolean;
}

export class UpdateContentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({ enum: ['DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED'], required: false })
  @IsOptional()
  @IsEnum(['DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED'])
  status?: string;
}
