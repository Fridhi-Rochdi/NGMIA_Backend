import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString, IsArray, IsBoolean } from 'class-validator';

export class GenerateCalendarDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  topic: string;

  @ApiProperty({ enum: ['WEEKLY', 'MONTHLY'] })
  @IsEnum(['WEEKLY', 'MONTHLY'])
  duration: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  platforms: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ enum: ['professional', 'casual', 'friendly', 'authoritative', 'playful'], required: false })
  @IsOptional()
  @IsEnum(['professional', 'casual', 'friendly', 'authoritative', 'playful'])
  tone?: string;

  @ApiProperty({ required: false, description: "Owner's IANA time zone, e.g. Africa/Casablanca." })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateCalendarDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateCalendarEventDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'], required: false })
  @IsOptional()
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'])
  platform?: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ enum: ['SCHEDULED', 'PUBLISHED', 'CANCELLED', 'DRAFT'], required: false })
  @IsOptional()
  @IsEnum(['SCHEDULED', 'PUBLISHED', 'CANCELLED', 'DRAFT'])
  status?: string;
  @ApiProperty({
    required: false,
    description:
      "Autoriser le planificateur a publier cet evenement tout seul. Faux par defaut: un calendrier est une proposition tant que son proprietaire n'a pas tranche.",
  })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

}

export class UpdateCalendarEventDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'], required: false })
  @IsOptional()
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE'])
  platform?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ enum: ['SCHEDULED', 'PUBLISHED', 'CANCELLED', 'DRAFT'], required: false })
  @IsOptional()
  @IsEnum(['SCHEDULED', 'PUBLISHED', 'CANCELLED', 'DRAFT'])
  status?: string;
  @ApiProperty({
    required: false,
    description:
      "Autoriser le planificateur a publier cet evenement tout seul. Faux par defaut: un calendrier est une proposition tant que son proprietaire n'a pas tranche.",
  })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

}
