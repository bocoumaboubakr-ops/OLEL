import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  AccountStatus, AlertStatus, BroadcastKind, BroadcastStatus, DeliveryStatus, Prisma, Role,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TerritoryService } from '../common/territory/territory.service';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { SendResult } from './channels/send-result';
import { FlagsService } from '../flags/flags.service';
import { normalizeLang } from '../common/i18n/alert-messages';
import { DISPATCH_ATTEMPTS } from './broadcast-dispatcher.service';

export const OPERATOR_ROLES: Role[] = [
  Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.HYDRO_METEO,
  Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL,
];

/** Canaux réellement mis en œuvre par ce processeur (audit F26). « app » = temps réel + liste in-app. */
export const MESSAGING_CHANNELS = ['whatsapp', 'sms'] as const;
type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/** Estimation indicative (non contractuelle) du coût par message réellement accepté. */
const CHANNEL_COST_XOF_ESTIMATE: Record<MessagingChannel, number> = { whatsapp: 5, sms: 25 };

const RECIPIENT_SELECT = {
  id: true, phone: true, language: true, lastWhatsappInboundAt: true,
  consents: { select: { whatsappOptInAt: true, optedOut: true } },
} satisfies Prisma.UserSelect;

const REACHED: DeliveryStatus[] = [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.READ, DeliveryStatus.SIMULATED];
const FINAL: BroadcastStatus[] = [BroadcastStatus.DONE, BroadcastStatus.PARTIAL, BroadcastStatus.FAILED, BroadcastStatus.CANCELLED];

interface Recipient {
  id: string; phone: string; language: string | null;
  /** Consentement WhatsApp explicite enregistré (et non désabonné) — audit F24 */
  waOptIn: boolean;
  /** Fenêtre de 24 h ouverte par un message du citoyen : texte libre autorisé */
  waWindowOpen: boolean;
}

/** Fenêtre de service client WhatsApp (politique Meta). */
const WHATSAPP_WINDOW_MS = 24 * 3600 * 1000;
export const FLAG_WHATSAPP_TEMPLATES = 'whatsapp_templates';
type Outcome = 'reached' | 'unreached' | 'ineligible';
type TemplateCall = { name: string; language: string; params: string[] };

/**
 * Exécute une intention de diffusion EXACTEMENT telle qu'approuvée (audit F04,
 * F22) : texte figé par langue, zones ciblées, canaux choisis (dans l'ordre),
 * une ligne de suivi par destinataire et canal.
 *
 * Reprises : un destinataire déjà atteint n'est jamais recontacté ; les
 * échecs sont retentés (bornés à DISPATCH_ATTEMPTS) puis mis à part et
 * visibles (statut PARTIAL/FAILED, lignes FAILED avec la cause).
 */
@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private territory: TerritoryService,
    private whatsapp: WhatsappService,
    private sms: SmsService,
    private flags: FlagsService,
  ) {}

  /** Tâches de l'ancien format (avant outbox) : jamais exécutées, pour ne rien envoyer de non figé. */
  @Process('fanout')
  async legacyFanout(job: Job) {
    this.logger.warn(`Tâche « fanout » héritée ignorée (alerte ${job.data?.alertId}) — non conforme au texte approuvé`);
  }

  @Process('dispatch')
  async handleDispatch(job: Job<{ broadcastId: string }>) {
    const b = await this.prisma.broadcast.findUnique({ where: { id: job.data.broadcastId }, include: { alert: true } });
    if (!b) return;
    if (FINAL.includes(b.status)) return;
    if (!b.payload || !b.kind) {
      await this.finalize(b.id, BroadcastStatus.CANCELLED, 'Intention sans texte figé — non exécutée');
      return;
    }

    // Réexamen de l'état au moment d'envoyer : une alerte retirée entre-temps ne part pas.
    const cancelReason = this.cancelReason(b.kind, b.alert.status);
    if (cancelReason) {
      await this.finalize(b.id, BroadcastStatus.CANCELLED, cancelReason);
      return;
    }

    await this.prisma.broadcast.update({ where: { id: b.id }, data: { attempts: { increment: 1 } } });
    const payload = b.payload as Record<string, unknown>;
    const templatesOn = await this.flags.isEnabled(FLAG_WHATSAPP_TEMPLATES);
    const channels = b.channels.filter((c): c is MessagingChannel => (MESSAGING_CHANNELS as readonly string[]).includes(c));
    const enabled: Record<string, boolean> = {};
    for (const c of channels) enabled[c] = await this.flags.isEnabled(c);

    const recipients = await this.resolveRecipients(b.kind, b.alert.zoneId, b.targetZoneIds);
    let unreached = 0;
    let ineligible = 0;
    for (const r of recipients) {
      const outcome = await this.deliverTo(b.id, r, channels, enabled, payload, templatesOn);
      if (outcome === 'unreached') unreached++;
      if (outcome === 'ineligible') ineligible++; // aucun canal autorisé : pas de reprise inutile
    }

    const reachedCount = recipients.length - unreached - ineligible;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? DISPATCH_ATTEMPTS);
    await this.recount(b.id, recipients.length);
    if (unreached > 0 && !lastAttempt) {
      await this.prisma.broadcast.update({ where: { id: b.id }, data: { lastError: `${unreached} destinataire(s) en échec — nouvelle tentative` } });
      throw new Error(`${unreached} destinataire(s) non atteint(s), reprise programmée`);
    }
    const missed = unreached + ineligible;
    const status = missed === 0 ? BroadcastStatus.DONE
      : reachedCount === 0 ? BroadcastStatus.FAILED : BroadcastStatus.PARTIAL;
    const reasons = [
      unreached ? `${unreached} destinataire(s) non atteint(s) après ${DISPATCH_ATTEMPTS} tentatives` : '',
      ineligible ? `${ineligible} destinataire(s) sans canal autorisé (consentement WhatsApp absent ou hors fenêtre 24 h sans modèle, pas de SMS)` : '',
    ].filter(Boolean).join(' ; ');
    await this.finalize(b.id, status, reasons || null);
    this.logger.log(`Diffusion ${b.id} [${b.kind}] : ${recipients.length} destinataires, ${unreached} non atteints → ${status}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<{ broadcastId?: string }>, err: Error) {
    if (job.name !== 'dispatch' || !job.data?.broadcastId) return;
    if (job.attemptsMade >= (job.opts.attempts ?? DISPATCH_ATTEMPTS)) {
      // Erreur inattendue (base indisponible…) : échec visible, jamais silencieux
      await this.prisma.broadcast.updateMany({
        where: { id: job.data.broadcastId, status: { notIn: FINAL } },
        data: { status: BroadcastStatus.FAILED, lastError: err.message, completedAt: new Date() },
      }).catch(() => undefined);
    }
  }

  private cancelReason(kind: BroadcastKind, status: AlertStatus): string | null {
    if (kind === BroadcastKind.INTERNAL) return null;
    const terminal: AlertStatus[] = [AlertStatus.REJECTED, AlertStatus.CANCELLED, AlertStatus.CLOSED, AlertStatus.RESOLVED];
    if (terminal.includes(status)) return `Alerte ${status} avant exécution — diffusion annulée`;
    if (kind === BroadcastKind.PRIMARY && status !== AlertStatus.BROADCAST && status !== AlertStatus.BROADCASTING) {
      return `État incohérent (${status}) pour une diffusion principale — annulée`;
    }
    if (kind === BroadcastKind.PREALERT && status !== AlertStatus.VALIDATED && status !== AlertStatus.BROADCAST) {
      return `Pré-alerte devenue sans objet (${status})`;
    }
    return null;
  }

  /**
   * Destinataires :
   *  - INTERNAL : opérateurs actifs dont le territoire contient la zone de
   *    l'alerte (zone, ses descendants, ses ancêtres) — jamais les zones sœurs.
   *  - PREALERT / PRIMARY : comptes actifs rattachés aux zones ciblées ou à
   *    leurs descendants (audit F09), hors désinscrits.
   */
  private async resolveRecipients(kind: BroadcastKind, alertZoneId: string, targetZoneIds: string[]): Promise<Recipient[]> {
    const base: Prisma.UserWhereInput = { status: AccountStatus.ACTIVE, deletedAt: null };
    if (kind === BroadcastKind.INTERNAL) {
      const zones = new Set([...(await this.territory.subtree(alertZoneId)), ...(await this.territory.ancestorsInclusive(alertZoneId))]);
      return this.toRecipients(await this.prisma.user.findMany({
        where: { ...base, role: { in: OPERATOR_ROLES }, zoneId: { in: Array.from(zones) } },
        select: RECIPIENT_SELECT,
      }));
    }
    const zones = await this.territory.subtreeOfMany(targetZoneIds.length ? targetZoneIds : [alertZoneId]);
    return this.toRecipients(await this.prisma.user.findMany({
      where: { ...base, zoneId: { in: zones }, NOT: { consents: { some: { optedOut: true } } } },
      select: RECIPIENT_SELECT,
    }));
  }

  private toRecipients(rows: Prisma.UserGetPayload<{ select: typeof RECIPIENT_SELECT }>[]): Recipient[] {
    const now = Date.now();
    return rows.map((u) => {
      const c = u.consents[0];
      return {
        id: u.id, phone: u.phone, language: u.language,
        waOptIn: !!c?.whatsappOptInAt && !c?.optedOut,
        waWindowOpen: !!u.lastWhatsappInboundAt && now - u.lastWhatsappInboundAt.getTime() < WHATSAPP_WINDOW_MS,
      };
    });
  }

  /**
   * Tente les canaux dans l'ordre choisi ; s'arrête au premier qui atteint le
   * destinataire. WhatsApp exige un consentement explicite ; hors fenêtre de
   * 24 h, seul un modèle approuvé peut être envoyé (politique Meta, audit F24).
   */
  private async deliverTo(
    broadcastId: string, r: Recipient, channels: MessagingChannel[], enabled: Record<string, boolean>,
    payload: Record<string, unknown>, templatesOn: boolean,
  ): Promise<Outcome> {
    const already = await this.prisma.broadcastDelivery.findFirst({
      where: { broadcastId, recipient: r.phone, status: { in: REACHED } }, select: { id: true },
    });
    if (already) return 'reached';

    const lang = normalizeLang(r.language);
    const text = (payload[lang] ?? payload.fr) as string;
    const template = (payload.templates as Record<string, TemplateCall> | undefined)?.[lang];
    let attempted = false;
    for (const channel of channels) {
      if (!enabled[channel]) {
        await this.upsertDelivery(broadcastId, r, channel, lang, { status: DeliveryStatus.SKIPPED, error: 'Canal désactivé (feature flag)' });
        continue;
      }
      let useTemplate = false;
      if (channel === 'whatsapp') {
        if (!r.waOptIn) {
          await this.upsertDelivery(broadcastId, r, channel, lang, { status: DeliveryStatus.SKIPPED, error: 'Pas de consentement WhatsApp enregistré' });
          continue;
        }
        if (!r.waWindowOpen) {
          if (!templatesOn || !template) {
            await this.upsertDelivery(broadcastId, r, channel, lang, { status: DeliveryStatus.SKIPPED, error: 'Hors fenêtre de 24 h : modèle Meta non activé' });
            continue;
          }
          useTemplate = true;
        }
      }
      if (!(await this.claim(broadcastId, r, channel, lang))) continue; // pris par une autre exécution
      attempted = true;
      try {
        const res: SendResult = channel === 'whatsapp'
          ? (useTemplate
            ? await this.whatsapp.sendTemplate(r.phone, template!.name, template!.language, template!.params)
            : await this.whatsapp.sendMessage(r.phone, text))
          : await this.sms.sendSms(r.phone, text);
        await this.prisma.broadcastDelivery.update({
          where: { broadcastId_recipient_channel: { broadcastId, recipient: r.phone, channel } },
          data: { status: res.simulated ? DeliveryStatus.SIMULATED : DeliveryStatus.SENT, providerMessageId: res.providerMessageId, error: null },
        });
        return 'reached';
      } catch (e) {
        await this.prisma.broadcastDelivery.update({
          where: { broadcastId_recipient_channel: { broadcastId, recipient: r.phone, channel } },
          data: { status: DeliveryStatus.FAILED, error: String((e as Error)?.message ?? e).slice(0, 500) },
        });
      }
    }
    return attempted ? 'unreached' : 'ineligible';
  }

  /** Réservation atomique (destinataire, canal) : une seule exécution envoie. */
  private async claim(broadcastId: string, r: Recipient, channel: string, lang: string): Promise<boolean> {
    try {
      await this.prisma.broadcastDelivery.create({
        data: { broadcastId, userId: r.id, recipient: r.phone, channel, lang, status: DeliveryStatus.QUEUED },
      });
      return true;
    } catch (e) {
      if ((e as Prisma.PrismaClientKnownRequestError).code !== 'P2002') throw e;
      // Ligne existante : seule une ligne en échec (ou désactivée) peut être retentée
      const { count } = await this.prisma.broadcastDelivery.updateMany({
        where: { broadcastId, recipient: r.phone, channel, status: { in: [DeliveryStatus.FAILED, DeliveryStatus.SKIPPED] } },
        data: { status: DeliveryStatus.QUEUED, attempts: { increment: 1 } },
      });
      return count === 1;
    }
  }

  private async upsertDelivery(broadcastId: string, r: Recipient, channel: string, lang: string, data: { status: DeliveryStatus; error?: string }) {
    await this.prisma.broadcastDelivery.upsert({
      where: { broadcastId_recipient_channel: { broadcastId, recipient: r.phone, channel } },
      create: { broadcastId, userId: r.id, recipient: r.phone, channel, lang, ...data },
      update: data,
    });
  }

  /** Compteurs recalculés depuis les lignes de suivi (source de vérité). */
  private async recount(broadcastId: string, total: number) {
    const rows = await this.prisma.broadcastDelivery.groupBy({ by: ['status', 'channel'], where: { broadcastId }, _count: true });
    const n = (st: DeliveryStatus[]) => rows.filter((x) => st.includes(x.status)).reduce((s, x) => s + x._count, 0);
    const cost = rows
      .filter((x) => x.status === DeliveryStatus.SENT || x.status === DeliveryStatus.DELIVERED || x.status === DeliveryStatus.READ)
      .reduce((s, x) => s + x._count * (CHANNEL_COST_XOF_ESTIMATE[x.channel as MessagingChannel] ?? 0), 0);
    const reached = await this.prisma.broadcastDelivery.findMany({
      where: { broadcastId, status: { in: REACHED } }, distinct: ['recipient'], select: { recipient: true },
    });
    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        totalRecipients: total,
        sentCount: n([DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.READ]),
        deliveredCount: n([DeliveryStatus.DELIVERED, DeliveryStatus.READ]),
        simulatedCount: n([DeliveryStatus.SIMULATED]),
        failedCount: Math.max(0, total - reached.length),
        costXof: cost,
      },
    });
  }

  private async finalize(broadcastId: string, status: BroadcastStatus, lastError: string | null) {
    await this.prisma.broadcast.update({ where: { id: broadcastId }, data: { status, lastError, completedAt: new Date() } });
  }
}
