import {
  Controller,
  Post,
  Body,
  UseGuards,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IvrService } from '../notifications/channels/ivr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface TriggerCallDto {
  phoneNumber: string;
  message: string;
}

interface IvrWebhookDto {
  sessionId: string;
  callerNumber: string;
  dtmfDigits?: string;
  isActive?: string;
}

@ApiTags('IVR')
@Controller('ivr')
export class IvrController {
  constructor(private ivrService: IvrService) {}

  @Post('call')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PREFECTURE)
  @ApiOperation({ summary: 'Déclencher un appel IVR vers un numéro' })
  async triggerCall(@Body() dto: TriggerCallDto) {
    await this.ivrService.makeCall(dto.phoneNumber, dto.message);
    return { success: true, message: `Appel IVR initié vers ${dto.phoneNumber}` };
  }

  @Post('webhook')
  @Header('Content-Type', 'application/xml')
  @ApiOperation({ summary: 'Webhook Africa\'s Talking — reçoit les touches DTMF, retourne XML' })
  handleWebhook(@Body() dto: IvrWebhookDto): string {
    const digits = dto.dtmfDigits || '';

    if (digits === '1') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="fr-FR">Réception confirmée. Merci. Au revoir.</Say>
</Response>`;
    }

    if (digits === '2') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="fr-FR">Votre signalement d'urgence a été enregistré. Les secours ont été alertés. Au revoir.</Say>
</Response>`;
    }

    // Default / initial prompt
    return this.ivrService.buildAlertXml('Alerte en cours', 'votre zone');
  }
}
