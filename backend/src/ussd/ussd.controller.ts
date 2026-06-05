import { Controller, Post, Body, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UssdService } from '../notifications/channels/ussd.service';

interface UssdSessionDto {
  sessionId: string;
  phoneNumber: string;
  text: string;
  serviceCode: string;
}

@ApiTags('USSD')
@Controller('ussd')
export class UssdController {
  constructor(private ussdService: UssdService) {}

  @Post('session')
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Endpoint USSD Africa\'s Talking — retourne CON/END texte brut' })
  handleSession(@Body() dto: UssdSessionDto): string {
    return this.ussdService.handleSession(
      dto.sessionId,
      dto.phoneNumber,
      dto.text,
      dto.serviceCode,
    );
  }
}
