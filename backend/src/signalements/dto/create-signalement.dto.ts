import {
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType, LocationSource } from '@prisma/client';
import { IsOlelMediaList } from '../../common/media/olel-media.decorator';

export class CreateSignalementDto {
  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  alertId?: string;

  @ApiPropertyOptional({ description: 'Canal d\'origine (app, web, whatsapp, ussd, ivr)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  channel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsOlelMediaList()
  mediaUrls?: string[];
}

export class CreateSignalementBotDto {
  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiPropertyOptional({ description: 'Téléphone E.164 du citoyen signaleur (attribution du signalement)' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: 'phone doit être au format E.164 (+221XXXXXXXXX)' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Gravité estimée : 1=vigilance, 2=alerte, 3=urgence' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  severity?: number;

  @ApiPropertyOptional({ description: 'Langue préférée du citoyen : fr | ff | wo | snk' })
  @IsOptional()
  @IsString()
  @Matches(/^(fr|ff|wo|snk)$/)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsOlelMediaList()
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Sous-type métier structuré (ex. ELEVAGE_EPIZOOTIE)', example: 'INFRA_ROUTE_COUPEE' })
  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,40}$/)
  subtype?: string;

  @ApiPropertyOptional({ description: 'Identifiant du message WhatsApp (dédoublonnage des réceptions répétées)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  messageId?: string;
}

/** Vérification terrain par une SENTINELLE (avant validation MAIRIE). */
export class FieldVerifySignalementDto {
  @ApiProperty({ description: 'Latitude relevée par la sentinelle sur place' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ description: 'Longitude relevée par la sentinelle sur place' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ description: 'Photo(s) prise(s) sur place (URLs)' })
  @IsOptional()
  @IsOlelMediaList()
  mediaUrls?: string[];

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

  @ApiPropertyOptional({ description: 'Notes terrain : ampleur, victimes, accessibilité' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
