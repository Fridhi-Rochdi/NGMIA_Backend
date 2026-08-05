import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Mon Entreprise' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'https://logo.com/logo.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  logo?: string;

  @ApiPropertyOptional({ example: 'mon-entreprise.com' })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;
}
