import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidationAction } from '@prisma/client';

/** Action de validation dans le cursus (sentinelle / mairie / préfecture). */
export class ValidateAlertDto {
  @ApiProperty({ enum: ValidationAction, example: ValidationAction.VALIDATED })
  @IsEnum(ValidationAction)
  action: ValidationAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({ description: 'Photo de preuve (obligatoire pour valider un signalement)' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 3, description: 'Gravité 0-3 (obligatoire étape sentinelle)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  gravity?: number;
}

/** Clôture d'une alerte (raison obligatoire). */
export class CloseAlertDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}
