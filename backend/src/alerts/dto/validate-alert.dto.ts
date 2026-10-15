import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertLevel, LocationSource, ValidationAction } from '@prisma/client';
import { IsOlelMedia } from '../../common/media/olel-media.decorator';

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

  @ApiPropertyOptional({ description: 'Photo de preuve (obligatoire pour valider un signalement) — média déposé via /upload' })
  @IsOptional()
  @IsOlelMedia()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Position capturée sur place (jamais substituée)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ enum: LocationSource, description: 'Provenance de la position : GPS de l\'appareil ou saisie manuelle' })
  @IsOptional()
  @IsEnum(LocationSource)
  locationSource?: LocationSource;

  @ApiPropertyOptional({ description: 'Précision annoncée par l\'appareil (mètres)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  locationAccuracyM?: number;

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

/** Diffusion d'urgence (bypass) : justification substantielle obligatoire. */
export class EmergencyBypassDto {
  @ApiProperty({ minLength: 20 })
  @IsString()
  @MaxLength(1000)
  justification: string;

  @ApiPropertyOptional({ description: 'Texte approuvé (sinon titre + description de l\'alerte)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ type: [String], description: 'Canaux : app, whatsapp, sms' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

/** Revue a posteriori d'un bypass. */
export class BypassReviewDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(1000)
  note: string;
}

/** Rectificatif d'une alerte diffusée (texte exact envoyé, sans traduction automatique). */
export class CorrectionDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({ type: [String], description: 'Canaux (défaut : ceux de la diffusion principale)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** Retrait d'une alerte diffusée (fausse alerte) : motif tracé, message facultatif. */
export class RetractionDto {
  @ApiProperty({ minLength: 20, description: 'Motif (interne, tracé dans l\'audit)' })
  @IsString()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ description: 'Message aux destinataires (défaut : « L\'alerte … est annulée »)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
