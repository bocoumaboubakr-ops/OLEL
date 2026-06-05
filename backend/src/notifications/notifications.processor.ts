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
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, phone: true, name: true, role: true },
    });

    const severityLabel = { 1: '🟡 Vigilance', 2: '🟠 Alerte', 3: '🔴 URGENCE' }[alert.severity] ?? '⚠️ Alerte';

    const message = isBroadcast
      ? `🚨 *OLEL – Alerte Officielle*\n${severityLabel}\n\n*${alert.title}*\n${alert.description}\n\n📍 Zone : ${alert.zone.name}\n\n⚠️ Suivez les consignes des autorités locales.`
      : `📋 *OLEL – Nouveau signalement à valider*\n\nType : ${alert.type}\n${alert.title}\n\n📍 Zone : ${alert.zone.name}\n\nConnectez-vous sur la plateforme OLEL pour valider ou rejeter ce signalement.`;

    let sent = 0, failed = 0;
    for (const user of users) {
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
    }

    this.logger.log(
      `Fanout alerte ${alertId} [${isBroadcast ? 'BROADCAST' : 'signalement'}] → ${users.length} destinataires | envoyé: ${sent} | échoué: ${failed}`,
    );
  }
}
