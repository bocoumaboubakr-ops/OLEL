import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsUUID,
  MaxLength,
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];
}

export class CreateSignalementBotDto {
  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

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
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];
}
