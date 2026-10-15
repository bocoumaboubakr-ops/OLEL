import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { InboundStatus } from '@prisma/client';

export class InboundDto {
  @IsString() @MaxLength(200) id: string;
  @Matches(/^\+?\d{8,15}$/) from: string;
  @IsString() @MaxLength(30) type: string;
  @IsObject() @IsNotEmptyObject() payload: Record<string, unknown>;
}

export class InboundStatusDto {
  @IsIn([InboundStatus.PROCESSED, InboundStatus.FAILED, InboundStatus.IGNORED]) status: InboundStatus;
  @IsOptional() @IsString() @MaxLength(500) error?: string;
}

export class SessionDto {
  @IsObject() state: Record<string, unknown>;
}

export class ConsentDto {
  @Matches(/^\+?\d{8,15}$/) phone: string;
  @IsIn(['WHATSAPP_OPT_IN', 'OPT_OUT', 'OPT_IN_AGAIN']) choice: 'WHATSAPP_OPT_IN' | 'OPT_OUT' | 'OPT_IN_AGAIN';
  @IsOptional() @Matches(/^(fr|ff|wo|snk)$/) language?: string;
}

export class ProviderStatusDto {
  @IsString() @MaxLength(200) providerMessageId: string;
  @IsString() @MaxLength(30) status: string;
  @IsOptional() timestamp?: string | number;
  @IsOptional() @IsString() @MaxLength(500) error?: string;
}

export class ProviderStatusesDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ProviderStatusDto)
  statuses: ProviderStatusDto[];
}

export class CitizenZoneDto {
  @Matches(/^\+?\d{8,15}$/) phone: string;
  @IsUUID() zoneId: string;
}
