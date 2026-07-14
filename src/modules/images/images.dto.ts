import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GenerateImageDto {
  @ApiProperty()
  @IsString()
  prompt: string;

  @ApiProperty({ enum: ['SQUARE', 'LANDSCAPE', 'PORTRAIT'], required: false })
  @IsOptional()
  @IsEnum(['SQUARE', 'LANDSCAPE', 'PORTRAIT'])
  aspectRatio?: string;

  @ApiProperty({ enum: ['realistic', 'artistic', 'minimalist', 'vintage', 'bold'], required: false })
  @IsOptional()
  @IsEnum(['realistic', 'artistic', 'minimalist', 'vintage', 'bold'])
  style?: string;
}

export class UpdateImageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({ enum: ['PENDING', 'GENERATING', 'COMPLETED', 'FAILED'], required: false })
  @IsOptional()
  @IsEnum(['PENDING', 'GENERATING', 'COMPLETED', 'FAILED'])
  status?: string;
}
