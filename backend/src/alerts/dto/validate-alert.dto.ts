import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertLevel, ValidationAction } from '@prisma/client';

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

  @ApiPropertyOptional({ enum: AlertLevel, description: 'Niveau d\'alerte proposé par le validateur' })
  @IsOptional()
  @IsEnum(AlertLevel)
  alertLevel?: AlertLevel;
}

/** Clôture d'une alerte (raison obligatoire). */
export class CloseAlertDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}

/** Diffusion d'une alerte validée. */
export class BroadcastAlertDto {
  @ApiProperty({ description: 'Message de diffusion' })
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs de zones cibles (défaut : zone de l\'alerte)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetZoneIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Canaux forcés (défaut : canaux du niveau d\'alerte)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @ApiPropertyOptional({ description: 'Clé d\'idempotence (anti-double envoi)' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
