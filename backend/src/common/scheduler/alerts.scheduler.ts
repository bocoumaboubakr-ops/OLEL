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

  /**
   * Clôture automatique des alertes NON diffusées sans activité depuis
   * STALE_HOURS heures. L'étape passe aussi à CLOSED : une alerte clôturée ne
   * peut plus être reprise par l'auto-escalade (audit F03). Tracé en audit.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoCloseStaleAlerts() {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.alert.findMany({
      where: { status: { in: ['PENDING', 'UNDER_REVIEW', 'VALIDATED'] }, broadcastAt: null, updatedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (!stale.length) return;
    const ids = stale.map((a) => a.id);
    const { count } = await this.prisma.alert.updateMany({
      where: { id: { in: ids }, status: { in: ['PENDING', 'UNDER_REVIEW', 'VALIDATED'] }, broadcastAt: null },
      data: {
        status: 'CLOSED', currentStep: 'CLOSED', closedAt: new Date(),
        closureReason: `Clôture automatique après ${STALE_HOURS}h sans activité (non diffusée)`,
      },
    });
    await this.prisma.auditLog.create({ data: { action: 'alert.auto_close', resource: 'alert', details: { alertIds: ids, hours: STALE_HOURS } } });
    this.logger.log(`Auto-clôture : ${count} alerte(s) non diffusée(s) fermée(s) après ${STALE_HOURS}h`);
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
