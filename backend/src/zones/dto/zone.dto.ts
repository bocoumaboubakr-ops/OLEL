import { IsString, IsNumber, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateZoneDto {
  @ApiProperty({ example: 'Ourossogui' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'SN-MT-OUR' })
  @IsString()
  @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'Code zone invalide (ex: SN-MT-OUR)' })
  code: string;

  @ApiProperty({ example: 'Matam' })
  @IsString()
  @MaxLength(100)
  region: string;

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
  @IsNumber()
  radiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

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
  @IsNumber()
  radiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}
