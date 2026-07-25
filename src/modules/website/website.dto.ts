import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class ContactInfoDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() googleReviewUrl?: string;
  @IsOptional() @IsString() googleMapsUrl?: string;
  @IsOptional() @IsString() hours?: string;
  @IsOptional() @IsString() mapQuery?: string;
}

class ColorsDto {
  @IsOptional() @IsString() primary?: string;
  @IsOptional() @IsString() secondary?: string;
  @IsOptional() @IsString() accent?: string;
}

class ProductDto {
  @IsString() name!: string;
  @IsString() price!: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() imagePrompt?: string;
  @IsOptional() @IsString() description?: string;
}

class GalleryImageDto {
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() imagePrompt?: string;
}

class GalleryDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GalleryImageDto)
  images?: GalleryImageDto[];
}

export class GenerateWebsiteDto {
  @IsString() businessName!: string;
  @IsString() businessType!: string;
  @IsString() description!: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  services?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductDto)
  products?: ProductDto[];

  @IsOptional() @ValidateNested() @Type(() => GalleryDto)
  gallery?: GalleryDto;

  @IsOptional() @IsString()
  context?: string;

  @IsOptional() @ValidateNested() @Type(() => ContactInfoDto)
  contactInfo?: ContactInfoDto;

  @IsOptional() @ValidateNested() @Type(() => ColorsDto)
  colors?: ColorsDto;

  @IsOptional() @IsString()
  fontFamily?: string;

  @IsOptional() @IsIn(['fr', 'en', 'es', 'ar', 'de'])
  language?: 'fr' | 'en' | 'es' | 'ar' | 'de';

  @IsOptional() @IsString()
  currency?: string;

  @IsOptional() @IsIn(['modern', 'classic', 'minimal', 'bold'])
  template?: 'modern' | 'classic' | 'minimal' | 'bold';

  @IsOptional() @IsString()
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
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() secondaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() fontFamily?: string;
  @IsOptional() @IsIn(['none', 'small', 'medium', 'large', 'full']) radius?: string;
  @IsOptional() @IsBoolean() animations?: boolean;
  @IsOptional() @IsIn(['compact', 'normal', 'spacious']) density?: string;
  @IsOptional() @IsIn(['pill', 'rounded', 'square']) buttonStyle?: string;
  @IsOptional() @IsIn(['gradient', 'image', 'minimal']) heroStyle?: string;
}
