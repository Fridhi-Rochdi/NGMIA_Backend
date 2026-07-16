import { IsString, IsOptional, IsNumber, IsEnum, ValidateNested, IsBoolean, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';

export class QrCodeColorDto {
  @IsOptional()
  @IsString()
  dark?: string;

  @IsOptional()
  @IsString()
  light?: string;
}

export class GenerateQrCodeDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrCodeColorDto)
  color?: QrCodeColorDto;

  @IsOptional()
  @IsEnum(['L', 'M', 'Q', 'H'])
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export class GenerateMenuQrCodeDto {
  @IsString()
  restaurantName: string;

  @IsString()
  @IsUrl()
  menuUrl: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrCodeColorDto)
  color?: QrCodeColorDto;
}

export class GeneratePosterQrCodeDto {
  @IsString()
  campaignName: string;

  @IsString()
  @IsUrl()
  posterUrl: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrCodeColorDto)
  color?: QrCodeColorDto;
}

export class GenerateVCardQrCodeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsNumber()
  size?: number;
}

export class GenerateWifiQrCodeDto {
  @IsString()
  ssid: string;

  @IsString()
  password: string;

  @IsEnum(['WPA', 'WEP', 'nopass'])
  encryption: 'WPA' | 'WEP' | 'nopass';

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @IsNumber()
  size?: number;
}