import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private sms: SmsService,
  ) {}

  @Process('fanout')
  async handleFanout(job: Job<{ alertId: string; isValidated?: boolean }>) {
    const { alertId } = job.data;

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { zone: true },
    });
    if (!alert) return;

    const users = await this.prisma.user.findMany({
      where: { zoneId: alert.zoneId, isActive: true },
      select: { id: true, phone: true, name: true },
    });

    const message = `🚨 ALERTE OLEL – ${alert.title}\n${alert.description}\nZone: ${alert.zone.name}`;

    for (const user of users) {
      try {
        await this.whatsapp.sendMessage(user.phone, message);
        await this.prisma.notificationLog.create({
          data: { alertId, channel: 'whatsapp', recipient: user.phone, status: 'sent' },
        });
      } catch (e) {
        this.logger.error(`WhatsApp échoué pour ${user.phone}: ${e.message}`);
        // Fallback SMS
        try {
          await this.sms.sendSms(user.phone, message);
          await this.prisma.notificationLog.create({
            data: { alertId, channel: 'sms', recipient: user.phone, status: 'sent' },
          });
        } catch (smsErr) {
          await this.prisma.notificationLog.create({
            data: { alertId, channel: 'sms', recipient: user.phone, status: 'failed', error: smsErr.message },
          });
        }
      }
    }

    this.logger.log(`Fanout alerte ${alertId} → ${users.length} utilisateurs`);
  }
}
