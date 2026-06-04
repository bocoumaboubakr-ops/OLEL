import { IsString, Matches, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OtpRequestDto {
  @ApiProperty({ example: '+221701234567', description: 'Numéro de téléphone au format international' })
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Format invalide — ex: +221701234567' })
  phone: string;

  @ApiPropertyOptional({ description: 'Nom complet (si première inscription)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: '+221701234567' })
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'Format invalide — ex: +221701234567' })
  phone: string;

  @ApiProperty({ example: '123456', description: 'Code OTP à 6 chiffres reçu par SMS' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code OTP doit être composé de 6 chiffres' })
  code: string;
}
