import { IsString, IsEnum, IsNumber, IsOptional, IsUUID, Min, Max, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertLevel, AlertType, LocationSource } from '@prisma/client';
import { IsOlelMediaList } from '../../common/media/olel-media.decorator';

export class CreateAlertDto {
  @ApiProperty({ example: 'Inondation secteur Ourossogui' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Montée des eaux dans le quartier nord.' })
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiPropertyOptional({ enum: AlertLevel, description: 'Niveau proposé (opérateurs). Pour un citoyen ou une sentinelle, le niveau découle de la gravité déclarée.' })
  @IsOptional()
  @IsEnum(AlertLevel)
  alertLevel?: AlertLevel;

  @ApiPropertyOptional({ minimum: 1, maximum: 3, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  severity?: number;

  @ApiPropertyOptional({ description: 'Zone concernée. Si absente, résolue depuis l\'utilisateur ou la zone par défaut.' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Commune concernée (lien Municipality)' })
  @IsOptional()
  @IsUUID()
  municipalityId?: string;

  @ApiPropertyOptional({ description: 'Canal d\'origine (app, web, whatsapp, ussd, ivr)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  channel?: string;

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

  @ApiPropertyOptional({ enum: LocationSource, description: 'Provenance de la position : GPS de l\'appareil ou saisie manuelle' })
  @IsOptional()
  @IsEnum(LocationSource)
  locationSource?: LocationSource;

  @ApiPropertyOptional({ description: 'Sous-type métier structuré (ex. ELEVAGE_EPIZOOTIE)', example: 'INFRA_ROUTE_COUPEE' })
  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,40}$/)
  subtype?: string;

  @ApiPropertyOptional({ description: 'Identifiant de requête généré par le client (rejeu hors connexion sans doublon)' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
