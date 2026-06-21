import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { Role } from '@prisma/client';
import { broadcastMessage, operatorMessage, normalizeLang } from '../common/i18n/alert-messages';

const OPERATOR_ROLES: Role[] = [
  Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.HYDRO_METEO,
  Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE,
  Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN,
];

// Coût indicatif par canal (XOF) pour le cost log des diffusions
const CHANNEL_COST_XOF: Record<string, number> = { whatsapp: 5, sms: 25, ivr: 50 };

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
  /** Etend une zone vers son arbre complet : ascendants + zone + descendants. */
  private async expandZoneTree(zoneId: string): Promise<string[]> {
    const ids = new Set<string>([zoneId]);
    let cur = await this.prisma.zone.findUnique({ where: { id: zoneId }, select: { id: true, parentId: true } });
    while (cur?.parentId) {
      ids.add(cur.parentId);
      cur = await this.prisma.zone.findUnique({ where: { id: cur.parentId }, select: { id: true, parentId: true } });
    }
    const children = await this.prisma.zone.findMany({
      where: { parentId: { in: Array.from(ids) } }, select: { id: true },
    });
    children.forEach((z) => ids.add(z.id));
    return Array.from(ids);
  }

  @Process('fanout')
  async handleFanout(job: Job<{ alertId: string; isBroadcast?: boolean; broadcastId?: string }>) {
    const { alertId, isBroadcast = false, broadcastId } = job.data;

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { zone: true },
    });
    if (!alert) return;

    // Scoping zone arborescent : on englobe l'arbre (ascendants + descendants)
    // pour qu'un citoyen rattache a la zone racine Matam recoive aussi les
    // alertes des sous-zones, et vice-versa.
    const zoneIds = await this.expandZoneTree(alert.zoneId);

    const where: any = { zoneId: { in: zoneIds }, isActive: true };
    if (!isBroadcast) {
      // Notification interne : seulement les operateurs pour valider/agir
      where.role = { in: OPERATOR_ROLES };
    } else {
      // RGPD non bloquant : on EXCLUT les users qui ont expressement opte out
      // (au lieu d'exiger un consent explicite, ce qui bloquait tout le monde
      //  faute d'opt-in). Cadre legal senegalais : alerte de securite publique.
      where.OR = [
        { consents: { none: {} } },
        { consents: { none: { optedOut: true } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, phone: true, name: true, role: true, language: true },
    });
    this.logger.log(`Fanout ${isBroadcast ? 'broadcast' : 'interne'} : ${users.length} destinataire(s) dans ${zoneIds.length} zone(s)`);

    // Chaque destinataire reçoit le message dans SA langue (broadcast citoyen).
    // Les messages internes (opérateurs) restent en français.
    const buildMessage = (lang: string): string =>
      isBroadcast
        ? broadcastMessage(alert.alertLevel as string, alert.title, alert.description, alert.zone.name, normalizeLang(lang))
        : operatorMessage(alert.type as string, alert.title, alert.zone.name);

    let sent = 0, failed = 0, costXof = 0;
    // Traitement par lots de 50 pour éviter la surcharge
    const BATCH_SIZE = 50;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (user) => {
        const message = buildMessage((user as any).language);
        try {
          await this.whatsapp.sendMessage(user.phone, message);
          await this.prisma.notificationLog.create({
            data: { alertId, channel: 'whatsapp', recipient: user.phone, status: 'sent' },
          });
          sent++; costXof += CHANNEL_COST_XOF.whatsapp;
        } catch {
          // Fallback SMS
          try {
            await this.sms.sendSms(user.phone, message);
            await this.prisma.notificationLog.create({
              data: { alertId, channel: 'sms', recipient: user.phone, status: 'sent' },
            });
            sent++; costXof += CHANNEL_COST_XOF.sms;
          } catch (smsErr) {
            await this.prisma.notificationLog.create({
              data: { alertId, channel: 'sms', recipient: user.phone, status: 'failed', error: (smsErr as Error).message },
            });
            failed++;
          }
        }
      }));
    }

    // Met à jour les statistiques de la diffusion (cost log + couverture)
    if (isBroadcast && broadcastId) {
      try {
        await this.prisma.broadcast.update({
          where: { id: broadcastId },
          data: { totalRecipients: users.length, deliveredCount: sent, costXof },
        });
      } catch (e) {
        this.logger.error(`Échec MAJ stats broadcast ${broadcastId}: ${(e as Error).message}`);
      }
    }

    this.logger.log(
      `Fanout alerte ${alertId} [${isBroadcast ? 'BROADCAST' : 'signalement'}] → ${users.length} destinataires | envoyé: ${sent} | échoué: ${failed} | coût: ${costXof} XOF`,
    );
  }
}
