import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FlagsService } from '../flags/flags.service';
import { pilotModeInfo } from '../common/pilot/pilot-mode';

/**
 * État de fonctionnement affiché aux opérateurs : mode pilote, canaux
 * réellement configurés, automatismes actifs. Aucune donnée personnelle.
 */
@ApiTags('Système')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system')
export class SystemController {
  constructor(private flags: FlagsService) {}

  @Get('info')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.HYDRO_METEO, Role.RADIO_COMMUNAUTAIRE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mode pilote, canaux configurés, automatismes actifs' })
  async info() {
    const [prealert, autoEscalation, templates] = await Promise.all([
      this.flags.isEnabled('prealert_red'), this.flags.isEnabled('auto_escalation_red'), this.flags.isEnabled('whatsapp_templates'),
    ]);
    return {
      ...pilotModeInfo(),
      channels: {
        whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
        sms: !!(process.env.AFRICAS_TALKING_KEY && process.env.AFRICAS_TALKING_KEY !== 'sandbox'),
      },
      automations: { prealert, autoEscalation, whatsappTemplates: templates },
    };
  }
}
