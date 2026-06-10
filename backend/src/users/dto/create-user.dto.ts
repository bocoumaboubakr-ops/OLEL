import {
  IsString,
  IsEnum,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Amadou Diallo' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '+221701234567' })
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Format téléphone invalide (ex: +221701234567)' })
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères' })
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

/** Création d'une sentinelle par un MAIRIE ou ADMIN. */
export class CreateSentinelleDto {
  @ApiProperty({ example: 'Aminata Diallo' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '+221776543210' })
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Format téléphone invalide (ex: +221776543210)' })
  phone: string;

  @ApiPropertyOptional({ description: 'Zone de la sentinelle (défaut : zone du mairie)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}
