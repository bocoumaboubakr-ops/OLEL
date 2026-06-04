import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsUUID,
  Min,
  Max,
  MaxLength,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType } from '@prisma/client';

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

  @ApiPropertyOptional({ minimum: 1, maximum: 3, default: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  severity?: number;

  @ApiProperty()
  @IsUUID()
  zoneId: string;

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
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];
}
