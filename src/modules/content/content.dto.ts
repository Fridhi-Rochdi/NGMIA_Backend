import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, MaxLength } from 'class-validator';

/**
 * What the owner can ask the picture to show. A subset of the art
 * direction's shot kinds: the ones that make sense next to a social post.
 */
export const CONTENT_IMAGE_KINDS = [
  'lifestyle',
  'product',
  'dish',
  'detail',
  'portrait',
  'interior',
  'hero',
] as const;

/** Square for a feed, portrait for a story, landscape for a blog header. */
export const CONTENT_IMAGE_FORMATS = ['square', 'portrait', 'landscape'] as const;

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

  @ApiProperty({ required: false, description: 'What the content is about. Falls back to `prompt`.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  topic?: string;

  @ApiProperty({ required: false, description: 'Business type chosen on the form, when it differs from the profile.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  businessType?: string;

  @ApiProperty({ required: false, description: 'Audience of this piece; defaults to the business profile.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  targetAudience?: string;

  @ApiProperty({ required: false, description: 'Awareness, conversion, loyalty…' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  objective?: string;

  @ApiProperty({ required: false, description: 'The exact call to action to use.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  callToAction?: string;

  @ApiProperty({ required: false, description: 'Output language code; defaults to the business profile.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiProperty({ required: false, description: 'Ask AI to generate a matching image for this content' })
  @IsOptional()
  @IsBoolean()
  generateImage?: boolean;

  @ApiProperty({
    enum: CONTENT_IMAGE_KINDS,
    required: false,
    description: 'What the picture shows. Defaults to the content type.',
  })
  @IsOptional()
  @IsEnum(CONTENT_IMAGE_KINDS)
  imageKind?: (typeof CONTENT_IMAGE_KINDS)[number];

  @ApiProperty({
    enum: CONTENT_IMAGE_FORMATS,
    required: false,
    description: 'Picture shape. Square suits a feed post, portrait a story.',
  })
  @IsOptional()
  @IsEnum(CONTENT_IMAGE_FORMATS)
  imageFormat?: (typeof CONTENT_IMAGE_FORMATS)[number];

  @ApiProperty({
    required: false,
    description: 'What the owner wants in the picture, in their own words. Overrides the written subject.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  imageBrief?: string;
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
