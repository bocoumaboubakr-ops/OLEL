import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PUBLIC_ACTIVE_STATUSES } from './alert-policy';

/**
 * Accès bot (clé API interne) aux alertes actives — utilisé par le menu
 * WhatsApp « Consulter les alertes » qui n'a pas de JWT utilisateur.
 */
@ApiTags('Alerts (bot)')
@ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
// Appel service-à-service authentifié par clé : pas de limitation par IP
@SkipThrottle()
@UseGuards(BotApiKeyGuard)
@Controller('alerts-bot')
export class AlertsBotController {
  constructor(private alerts: AlertsService, private prisma: PrismaService) {}

  @Get('active')
  @ApiOperation({ summary: 'Alertes actives (résumé) pour diffusion bot' })
  async getActive() {
    // Même définition que le dashboard et les statistiques : alerte DIFFUSÉE non clôturée (audit F16).
    // Seules des informations publiques sont exposées au canal bot.
    const alerts = await this.prisma.alert.findMany({
      where: { status: { in: PUBLIC_ACTIVE_STATUSES } },
      orderBy: [{ alertLevel: 'desc' }, { broadcastAt: 'desc' }],
      take: 5,
      include: { zone: { select: { name: true } } },
    });
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
