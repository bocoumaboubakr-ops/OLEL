import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertLevel, AlertType } from '@prisma/client';
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

  @ApiPropertyOptional({ enum: AlertLevel, default: 'BLEU', description: 'Niveau d\'alerte (BLEU par défaut)' })
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
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsOlelMediaList()
  mediaUrls?: string[];
}
