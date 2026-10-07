import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsBoolean,
  IsUrl,
  Matches,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Form fields arrive as "" when left blank; treat that as "not provided". */
const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

/** Rendered into a <style> block: anything but a hex colour is refused. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HTTP_URL = { protocols: ['http', 'https'], require_protocol: true };

class ContactInfoDto {
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(254) email?: string;
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(40) whatsapp?: string;
  @EmptyToUndefined() @IsOptional() @IsUrl(HTTP_URL) @MaxLength(2048) googleReviewUrl?: string;
  @EmptyToUndefined() @IsOptional() @IsUrl(HTTP_URL) @MaxLength(2048) googleMapsUrl?: string;
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(300) hours?: string;
  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(300) mapQuery?: string;
}

class ColorsDto {
  @EmptyToUndefined() @IsOptional() @Matches(HEX_COLOR) primary?: string;
  @EmptyToUndefined() @IsOptional() @Matches(HEX_COLOR) secondary?: string;
  @EmptyToUndefined() @IsOptional() @Matches(HEX_COLOR) accent?: string;
}

class ProductDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(40) price!: string;
  @IsOptional() @IsString() @MaxLength(2048) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) imagePrompt?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class TestimonialDto {
  @IsString() @MaxLength(600) quote!: string;
  @IsOptional() @IsString() @MaxLength(80) author?: string;
  @IsOptional() @IsString() @MaxLength(80) role?: string;
}

class GalleryImageDto {
  @IsOptional() @IsString() @MaxLength(2048) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) imagePrompt?: string;
}

class GalleryDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => GalleryImageDto)
  images?: GalleryImageDto[];
}

export class GenerateWebsiteDto {
  // Optional: filled from the tenant's business context when omitted.
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @IsString() @MaxLength(60) businessType?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(200, { each: true })
  services?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ProductDto)
  products?: ProductDto[];

  @IsOptional() @ValidateNested() @Type(() => GalleryDto)
  gallery?: GalleryDto;

  @IsOptional() @IsString() @MaxLength(4000)
  context?: string;

  /** Real customer reviews. The site shows these and never writes its own. */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => TestimonialDto)
  testimonials?: TestimonialDto[];

  @IsOptional() @ValidateNested() @Type(() => ContactInfoDto)
  contactInfo?: ContactInfoDto;

  @IsOptional() @ValidateNested() @Type(() => ColorsDto)
  colors?: ColorsDto;

  @IsOptional() @Matches(/^[\p{L}\p{N} -]{1,60}$/u)
  fontFamily?: string;

  @IsOptional() @IsIn(['fr', 'en', 'es', 'ar', 'de'])
  language?: 'fr' | 'en' | 'es' | 'ar' | 'de';

  @IsOptional() @IsString() @MaxLength(10)
  currency?: string;

  @IsOptional() @IsIn(['modern', 'classic', 'minimal', 'bold'])
  template?: 'modern' | 'classic' | 'minimal' | 'bold';

  @EmptyToUndefined() @IsOptional() @IsString() @MaxLength(2048)
  logoUrl?: string;
}

export class UpdateTextDto {
  @IsString() path!: string;
  @IsString() value!: string;
}

export class GenerateImageDto {
  @IsString() path!: string;
  @IsOptional() @IsString() prompt?: string;
}

export class UploadImageDto {
  @IsString() path!: string;
}

export class AddSectionDto {
  @IsString() request!: string;
}

export class DesignAssistDto {
  @IsString() instruction!: string;
}

export class ReorderSectionsDto {
  @IsArray() @IsString({ each: true }) order!: string[];
}

export class ToggleSectionDto {
  @IsBoolean() visible!: boolean;
}

export class UpdateThemeDto {
  @IsOptional() @IsIn(['modern', 'classic', 'minimal', 'bold'])
  template?: 'modern' | 'classic' | 'minimal' | 'bold';
  @IsOptional() @Matches(HEX_COLOR) primaryColor?: string;
  @IsOptional() @Matches(HEX_COLOR) secondaryColor?: string;
  @IsOptional() @Matches(HEX_COLOR) accentColor?: string;
  @IsOptional() @Matches(/^[\p{L}\p{N} -]{1,60}$/u) fontFamily?: string;
  @IsOptional() @IsIn(['none', 'small', 'medium', 'large', 'full']) radius?: string;
  @IsOptional() @IsBoolean() animations?: boolean;
  @IsOptional() @IsIn(['compact', 'normal', 'spacious']) density?: string;
  @IsOptional() @IsIn(['pill', 'rounded', 'square']) buttonStyle?: string;
  @IsOptional() @IsIn(['gradient', 'image', 'minimal']) heroStyle?: string;
}
