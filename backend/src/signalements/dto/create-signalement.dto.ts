import {
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType } from '@prisma/client';

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
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
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
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(10)
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
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];
}

/** Vérification terrain par une SENTINELLE (avant validation MAIRIE). */
export class FieldVerifySignalementDto {
  @ApiProperty({ description: 'Latitude relevée par la sentinelle sur place' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Longitude relevée par la sentinelle sur place' })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ description: 'Photo(s) prise(s) sur place (URLs)' })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Notes terrain : ampleur, victimes, accessibilité' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
