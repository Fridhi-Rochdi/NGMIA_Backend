import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  /** Low for strict JSON, higher for prose. Defaults to 0.7. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1.5)
  temperature?: number;
}

export type ImageSize =
  | '256x256'
  | '512x512'
  | '768x768'
  | '1024x1024'
  | '1344x768'
  | '1152x896'
  | '896x1152'
  | '832x1216';

export class GenerateImageOptions {
  @IsString()
  @MaxLength(4000)
  prompt: string;

  // Only combinations FLUX actually accepts. The square-only list made
  // landscape heroes and portrait posters impossible to request.
  @IsOptional()
  @IsEnum([
    '256x256',
    '512x512',
    '768x768',
    '1024x1024',
    '1344x768',
    '1152x896',
    '896x1152',
    '832x1216',
  ])
  size?: ImageSize;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aspectRatio?: string;

  /**
   * Fixing the seed is what keeps a brand's images in the same family across
   * separate generations; omitted, the provider picks a random one.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  seed?: number;

  /**
   * Diffusion steps for this image, overriding NVIDIA_NIM_IMAGE_STEPS.
   *
   * Photography and flat vector marks do not want the same budget. A dish at
   * 8 steps is a usable photograph because noise reads as grain; a logo at 8
   * steps is a grey smudge, because a flat shape has nowhere to hide an
   * unfinished denoise. Callers that need clean edges ask for more.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  steps?: number;

  // Internal only (no validator, so the global whitelist strips it from HTTP
  // bodies): render on a transparent background where the provider can.
  transparent?: boolean;
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

  /**
   * Who the post is for. Without these the model invents a business — it
   * returned "Chez Mario" for a tenant called Trattoria Nonna Lidia, because
   * the service loaded the business context and then passed only the tone.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  businessDescription?: string;

  // Internal only (no validators, so the global whitelist strips them from
  // HTTP bodies): set by the services that know the tenant.

  /** A pre-rendered <brand_context> block; replaces the three fields above. */
  brandContext?: string;
  /** The specific angle of this post, e.g. one day of an editorial calendar. */
  angle?: string;
}
