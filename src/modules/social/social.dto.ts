import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsDateString, IsBoolean } from 'class-validator';

export class GenerateSocialPostDto {
  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'] })
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'])
  platform: string;

  @ApiProperty()
  @IsString()
  topic: string;

  @ApiProperty({ enum: ['professional', 'casual', 'friendly', 'authoritative', 'playful'], required: false })
  @IsOptional()
  @IsEnum(['professional', 'casual', 'friendly', 'authoritative', 'playful'])
  tone?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  hashtags?: string[];
}

export class UpdateSocialPostDto {
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

export class ConnectSocialAccountDto {
  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'] })
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'])
  platform: string;

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  accessToken: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class UpdateSocialAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
