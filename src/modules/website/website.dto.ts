import { IsString, IsOptional, IsArray, ValidateNested, IsIn, IsEmail, IsPhoneNumber } from 'class-validator';
import { Type } from 'class-transformer';

class ContactInfoDto {
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

class ColorsDto {
  @IsOptional()
  @IsString()
  primary?: string;

  @IsOptional()
  @IsString()
  secondary?: string;

  @IsOptional()
  @IsString()
  accent?: string;
}

export class GenerateWebsiteDto {
  @IsString()
  businessName!: string;

  @IsString()
  businessType!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contactInfo?: ContactInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ColorsDto)
  colors?: ColorsDto;

  @IsOptional()
  @IsIn(['modern', 'classic', 'minimal', 'bold'])
  template?: 'modern' | 'classic' | 'minimal' | 'bold';
}