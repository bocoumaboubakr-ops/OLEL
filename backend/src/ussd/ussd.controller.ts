import { Controller, Post, Body, Header, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UssdService } from './ussd.service';
import { ProviderCallbackGuard } from '../common/guards/provider-callback.guard';

interface UssdSessionDto {
  sessionId: string;
  phoneNumber: string;
  text: string;
  serviceCode: string;
}

@ApiTags('USSD')
@Controller('ussd')
// Rappels du fournisseur (passerelle unique) : authentifiés par secret, pas limités par IP
@SkipThrottle()
@UseGuards(ProviderCallbackGuard)
export class UssdController {
  constructor(private ussdService: UssdService) {}

  @Post('session')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Rappel USSD Africa\'s Talking — retourne CON/END texte brut (?key= secret requis)' })
  handleSession(@Body() dto: UssdSessionDto): Promise<string> {
    return this.ussdService.handleSession(String(dto.sessionId ?? ''), String(dto.phoneNumber ?? ''), String(dto.text ?? ''));
  }
}
