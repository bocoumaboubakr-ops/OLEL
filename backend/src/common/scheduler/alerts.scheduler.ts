import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from '../../alerts/alerts.service';

const STALE_HOURS = parseInt(process.env.ALERT_AUTO_CLOSE_HOURS || '48', 10);

@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(private prisma: PrismaService, private alerts: AlertsService) {}

  /**
   * Auto-escalade : toutes les 5 min, scanne les alertes ROUGE/ROUGE_FONCE
   * vérifiées mais non confirmées depuis AUTO_ESCALATION_MINUTES → diffuse
   * automatiquement avec mention « non confirmée par l'autorité ».
   * Évite qu'un week-end ou une nuit ne retarde une urgence vitale.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoEscalateUrgentAlerts() {
    try {
      await this.alerts.autoEscalateStale();
    } catch (e) {
      this.logger.error(`Auto-escalade échouée : ${(e as Error).message}`);
    }
  }

  /** Ferme automatiquement les alertes sans activité depuis STALE_HOURS heures. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoCloseStaleAlerts() {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    const { count } = await this.prisma.alert.updateMany({
      where: {
        status: { notIn: ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED', 'BROADCAST'] },
        updatedAt: { lt: cutoff },
      },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closureReason: `Clôture automatique après ${STALE_HOURS}h sans activité`,
      },
    });
    if (count > 0) this.logger.log(`Auto-clôture : ${count} alerte(s) fermée(s) après ${STALE_HOURS}h d'inactivité`);
  }

  /** Supprime les OTP de plus de 24h (nettoyage RGPD). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredOtps() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.otpRequest.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`OTP cleanup : ${count} enregistrement(s) supprimé(s)`);
  }
}
