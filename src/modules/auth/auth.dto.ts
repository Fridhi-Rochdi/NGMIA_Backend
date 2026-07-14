import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(50)
  password: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: 'Mon Entreprise' })
  @IsString()
  @MinLength(2, { message: 'Le nom du tenant doit contenir au moins 2 caractères' })
  tenantName: string;

  @ApiProperty({ example: 'mon-entreprise' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  tenantSlug: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ example: 'mon-entreprise' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
