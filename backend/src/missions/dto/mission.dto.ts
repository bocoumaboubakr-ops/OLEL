import { IsString, IsEnum, IsOptional, IsUUID, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MissionType } from '@prisma/client';

export class CreateMissionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ enum: MissionType })
  @IsOptional()
  @IsEnum(MissionType)
  type?: MissionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  alertId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class AssignMissionDto {
  @ApiProperty()
  @IsUUID()
  sentinelId: string;
}

export class CompleteMissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  report?: string;
}
