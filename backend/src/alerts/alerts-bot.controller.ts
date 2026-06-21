import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { AlertsService } from './alerts.service';

/**
 * Accès bot (clé API interne) aux alertes actives — utilisé par le menu
 * WhatsApp « Consulter les alertes » qui n'a pas de JWT utilisateur.
 */
@ApiTags('Alerts (bot)')
@ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
@UseGuards(BotApiKeyGuard)
@Controller('alerts-bot')
export class AlertsBotController {
  constructor(private alerts: AlertsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Alertes actives (résumé) pour diffusion bot' })
  async getActive() {
    const { alerts } = await this.alerts.findAll({ status: 'ACTIVE' as any, page: 1, limit: 5 });
    // Résumé minimal : ne pas exposer les détails internes au canal bot
    return alerts.map((a: any) => ({
      id: a.id,
      title: a.title,
      alertLevel: a.alertLevel,
      status: a.status,
      type: a.type,
      zone: a.zone ? { name: a.zone.name } : null,
      createdAt: a.createdAt,
    }));
  }
}
