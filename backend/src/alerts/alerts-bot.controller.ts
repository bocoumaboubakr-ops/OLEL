import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../common/prisma/prisma.service';

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
  @ApiOperation({ summary: 'Alertes publiques en vigueur (résumé) — ?phone= pour la zone du citoyen' })
  async getActive(@Query('phone') phone?: string) {
    // Même définition que le mobile, l'USSD et les statistiques (audit F16) ;
    // cloisonnée par la zone du citoyen quand il est connu.
    const normalized = phone ? (phone.startsWith('+') ? phone : `+${phone.trim()}`) : undefined;
    const user = normalized ? await this.prisma.user.findUnique({ where: { phone: normalized }, select: { zoneId: true } }) : null;
    return this.alerts.publicActiveFor(user?.zoneId ?? null, 5);
  }
}
