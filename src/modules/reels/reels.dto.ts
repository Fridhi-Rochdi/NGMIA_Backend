import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const REEL_PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS'] as const;
export const REEL_THEMES = [
  'BUSINESS',
  'PRODUCT',
  'PROMOTION',
  'BEHIND_THE_SCENES',
  'TESTIMONIAL',
  'EDUCATIONAL',
] as const;
export const REEL_TONES = ['PROFESSIONAL', 'FRIENDLY', 'BOLD', 'CALM', 'PLAYFUL'] as const;
export const REEL_STYLES = ['MODERN', 'CLASSIC', 'MINIMAL', 'BOLD', 'ELEGANT', 'RUSTIC'] as const;
export const REEL_MUSIC = ['UPBEAT', 'CALM', 'CINEMATIC', 'ENERGETIC', 'WARM'] as const;

export class GenerateReelDto {
  @ApiPropertyOptional({ description: 'Defaults to the tenant business context.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @ApiPropertyOptional({ description: 'What the reel is about.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Shown as the reel title in the library.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: REEL_PLATFORMS })
  @IsOptional()
  @IsEnum(REEL_PLATFORMS)
  platform?: (typeof REEL_PLATFORMS)[number];

  @ApiPropertyOptional({ enum: REEL_THEMES })
  @IsOptional()
  @IsEnum(REEL_THEMES)
  theme?: (typeof REEL_THEMES)[number];

  @ApiPropertyOptional({ enum: REEL_TONES })
  @IsOptional()
  @IsEnum(REEL_TONES)
  tone?: (typeof REEL_TONES)[number];

  @ApiPropertyOptional({ enum: REEL_STYLES, description: 'Overrides the brand kit style.' })
  @IsOptional()
  @IsEnum(REEL_STYLES)
  style?: (typeof REEL_STYLES)[number];

  @ApiPropertyOptional({ enum: REEL_MUSIC })
  @IsOptional()
  @IsEnum(REEL_MUSIC)
  musicMood?: (typeof REEL_MUSIC)[number];

  @ApiPropertyOptional({ minimum: 10, maximum: 90, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(90)
  durationSec?: number;

  @ApiPropertyOptional({
    description: 'Points the script must cover, in order.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyPoints?: string[];
}

export class UpdateReelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];
}

/** One scene, as stored and as returned to the client. */
export interface ReelScene {
  index: number;
  startSec: number;
  durationSec: number;
  headline: string;
  support?: string;
  kicker?: string;
  /** English subject line handed to the image model. */
  imagePrompt?: string;
  /** Stored photograph for this scene. */
  imageUrl?: string | null;
  /** The presenter's take for this scene (MP4, with the spoken line). */
  presenterUrl?: string | null;
  /** True when the presenter is on screen; false for a cut-away shot. */
  onCamera?: boolean;
  /** Stored composed frame (photo + type), 1080x1920. */
  frameUrl?: string | null;
  /** The line to speak, written by the model. */
  voiceover?: string;
  /** Stored audio of that line once synthesised. */
  voiceUrl?: string | null;
  /** Measured length of the spoken line; the scene is never shorter. */
  voiceSeconds?: number;
  /** Which TTS provider spoke it, for support and for the status line. */
  voiceProvider?: string;
  transition?: string;
  cta?: string;
}
