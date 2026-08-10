import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MediaType {
  PHOTO = 'photo',
  VIDEO = 'video',
}

export enum ReelTheme {
  LIFESTYLE = 'lifestyle',
  BUSINESS = 'business',
  PRODUCT = 'product',
  TUTORIAL = 'tutorial',
  TESTIMONIAL = 'testimonial',
  EVENT = 'event',
  ANNOUNCEMENT = 'announcement',
}

export enum ReelTone {
  PROFESSIONAL = 'professional',
  CASUAL = 'casual',
  ENERGETIC = 'energetic',
  EMOTIONAL = 'emotional',
  HUMOROUS = 'humorous',
  INSPIRATIONAL = 'inspirational',
}

export enum ReelDuration {
  DURATION_15 = '15s',
  DURATION_30 = '30s',
  DURATION_60 = '60s',
  DURATION_90 = '90s',
}

export enum ReelPlatform {
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  YOUTUBE_SHORTS = 'youtube_shorts',
  FACEBOOK_REELS = 'facebook_reels',
}

export enum MusicMood {
  UPBEAT = 'upbeat',
  CHILL = 'chill',
  EMOTIONAL = 'emotional',
  TRENDING = 'trending',
  CINEMATIC = 'cinematic',
  CORPORATE = 'corporate',
}

export enum ReelStyle {
  MODERN = 'modern',
  MINIMALIST = 'minimalist',
  BOLD = 'bold',
  ELEGANT = 'elegant',
  PLAYFUL = 'playful',
  CINEMATIC = 'cinematic',
}

export enum ShotType {
  HOOK = 'hook',
  WIDE = 'wide',
  MEDIUM = 'medium',
  CLOSE_UP = 'close-up',
  POV = 'pov',
  B_ROLL = 'b-roll',
  TEXT_OVERLAY = 'text-overlay',
  SPLIT_SCREEN = 'split-screen',
}

export enum TransitionType {
  CUT = 'cut',
  FADE = 'fade',
  DISSOLVE = 'dissolve',
  ZOOM = 'zoom',
  PAN = 'pan',
  SLIDE = 'slide',
  BOUNCE = 'bounce',
  GLITCH = 'glitch',
}

export class MediaInput {
  @IsEnum(MediaType)
  type: MediaType;

  @IsString()
  @MaxLength(2048)
  url: string;

  @IsString()
  @MaxLength(1000)
  description: string;
}

export class TextContentInput {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  body: string;

  @IsString()
  @MaxLength(500)
  cta: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hashtags: string[];
}

export class GenerateReelsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MediaInput)
  media: MediaInput[];

  @ValidateNested()
  @Type(() => TextContentInput)
  text_content: TextContentInput;

  @IsEnum(ReelTheme)
  @IsOptional()
  theme?: ReelTheme = ReelTheme.BUSINESS;

  @IsEnum(ReelTone)
  @IsOptional()
  tone?: ReelTone = ReelTone.PROFESSIONAL;

  @IsEnum(ReelDuration)
  @IsOptional()
  duration?: ReelDuration = ReelDuration.DURATION_30;

  @IsEnum(ReelPlatform)
  @IsOptional()
  platform?: ReelPlatform = ReelPlatform.INSTAGRAM;

  @IsEnum(MusicMood)
  @IsOptional()
  music_mood?: MusicMood = MusicMood.UPBEAT;

  @IsEnum(ReelStyle)
  @IsOptional()
  style?: ReelStyle = ReelStyle.MODERN;
}

// Output interfaces
export interface ReelMetadata {
  platform: string;
  duration_seconds: number;
  theme: string;
  tone: string;
  style: string;
  created_at: string;
}

export interface CaptionOverlay {
  text: string;
  position: string;
  animation: string;
}

export interface Scene {
  scene_number: number;
  start_time: number;
  end_time: number;
  duration: number;
  media_index: number | null;
  shot_type: string;
  transition: string;
  voiceover: string;
  caption_overlay: CaptionOverlay;
  music_cue: string;
}

export interface Script {
  total_duration: number;
  scenes: Scene[];
}

export interface TextOverlay {
  scene_number: number;
  text: string;
  position: string;
  font_size: string;
  color: string;
  animation: string;
  start_time: number;
  end_time: number;
}

export interface Caption {
  text: string;
  start_time: number;
  end_time: number;
  style: string;
}

export interface VoiceoverSegment {
  text: string;
  start_time: number;
  end_time: number;
  pace: string;
}

// ============================================
// AI Engine Options Interfaces
// ============================================

export class GenerateTextOptions {
  @IsString()
  @MaxLength(10000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  length?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;
}

export class GenerateImageOptions {
  @IsString()
  @MaxLength(4000)
  prompt: string;

  @IsOptional()
  @IsEnum(['256x256', '512x512', '1024x1024'])
  size?: '256x256' | '512x512' | '1024x1024';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aspectRatio?: string;
}

export class GenerateBrandingOptions {
  @IsString()
  @MaxLength(200)
  brandName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  style?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  values?: string[];
}

export class GenerateSocialPostOptions {
  @IsString()
  @MaxLength(2000)
  topic: string;

  @IsString()
  @MaxLength(50)
  platform: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;
}

export interface VoiceoverScript {
  full_text: string;
  segments: VoiceoverSegment[];
}

export interface SuggestedTrack {
  name: string;
  artist: string;
  mood: string;
  bpm: number;
}

export interface MusicCuePoint {
  time: number;
  action: string;
}

export interface Music {
  mood: string;
  suggested_tracks: SuggestedTrack[];
  cue_points: MusicCuePoint[];
}

export interface ThumbnailSuggestion {
  scene_number: number;
  description: string;
  text_overlay: string;
}

export interface ProductionNotes {
  equipment_needed: string[];
  lighting_tips: string[];
  filming_tips: string[];
  editing_suggestions: string[];
}

export interface GenerateReelsResponse {
  reel_metadata: ReelMetadata;
  script: Script;
  text_overlays: TextOverlay[];
  captions: Caption[];
  voiceover_script: VoiceoverScript;
  music: Music;
  hashtags: string[];
  caption_final: string;
  cta_final: string;
  thumbnail_suggestion: ThumbnailSuggestion;
  production_notes: ProductionNotes;
}
