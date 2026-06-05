import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { Role } from '@prisma/client';

const OPERATOR_ROLES: Role[] = [Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN];

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private sms: SmsService,
  ) {}

  /**
   * Fanout différencié :
   * - isBroadcast=false (création signalement) → notifie UNIQUEMENT les sentinelles/opérateurs de la zone
   * - isBroadcast=true  (diffusion préfecture) → notifie TOUS les habitants actifs de la zone
   */
  @Process('fanout')
  async handleFanout(job: Job<{ alertId: string; isBroadcast?: boolean }>) {
    const { alertId, isBroadcast = false } = job.data;

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { zone: true },
    });
    if (!alert) return;

    const where: any = { zoneId: alert.zoneId, isActive: true };
    if (!isBroadcast) {
      // Notification interne : seulement les opérateurs pour valider
      where.role = { in: OPERATOR_ROLES };
    } else {
      // RGPD : exclure les utilisateurs sans consentement explicite
      where.consents = { some: { termsAccepted: true } };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, phone: true, name: true, role: true },
    });

    const severityLabel = { 1: 'Vigilance', 2: 'Alerte', 3: 'URGENCE' }[alert.severity] ?? 'Alerte';

    const message = isBroadcast
      ? `[OLEL] ALERTE OFFICIELLE - ${severityLabel}\n${alert.title}\n${alert.description}\nZone : ${alert.zone.name}\nSuivez les consignes des autorites locales.`
      : `[OLEL] Nouveau signalement a valider\nType : ${alert.type}\n${alert.title}\nZone : ${alert.zone.name}\nConnectez-vous sur la plateforme OLEL.`;

    let sent = 0, failed = 0;
    // Traitement par lots de 50 pour éviter la surcharge
    const BATCH_SIZE = 50;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (user) => {
        try {
          await this.whatsapp.sendMessage(user.phone, message);
          await this.prisma.notificationLog.create({
            data: { alertId, channel: 'whatsapp', recipient: user.phone, status: 'sent' },
          });
          sent++;
        } catch {
          // Fallback SMS
          try {
            await this.sms.sendSms(user.phone, message);
            await this.prisma.notificationLog.create({
              data: { alertId, channel: 'sms', recipient: user.phone, status: 'sent' },
            });
            sent++;
          } catch (smsErr) {
            await this.prisma.notificationLog.create({
              data: { alertId, channel: 'sms', recipient: user.phone, status: 'failed', error: (smsErr as Error).message },
            });
            failed++;
          }
        }
      }));
    }

    this.logger.log(
      `Fanout alerte ${alertId} [${isBroadcast ? 'BROADCAST' : 'signalement'}] → ${users.length} destinataires | envoyé: ${sent} | échoué: ${failed}`,
    );
  }
}
