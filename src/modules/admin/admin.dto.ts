import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListQueryDto {
  @IsOptional() @IsString() search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}

export class UpdateTenantAdminDto {
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsIn(['FREE', 'STARTER', 'PRO', 'ENTERPRISE'])
  plan?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  maxUsers?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  maxProjects?: number;
}
