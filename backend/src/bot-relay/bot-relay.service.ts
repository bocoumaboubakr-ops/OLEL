import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryStatus, InboundStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** Durée de vie d'une conversation du bot sans activité. */
export const BOT_SESSION_TTL_MS = 24 * 3600 * 1000;
/** Un message reçu mais non traité depuis ce délai est proposé à la reprise. */
export const INBOUND_STUCK_MS = 2 * 60 * 1000;
const MAX_INBOUND_ATTEMPTS = 5;

/** Progression des statuts fournisseur : jamais de retour en arrière. */
const RANK: Partial<Record<DeliveryStatus, number>> = {
  [DeliveryStatus.QUEUED]: 0, [DeliveryStatus.SENT]: 1, [DeliveryStatus.DELIVERED]: 2, [DeliveryStatus.READ]: 3,
};

const normalizePhone = (p: string) => (p.startsWith('+') ? p : `+${p}`);

/**
 * Relais durable du bot WhatsApp (audit F22, F24, F25).
 *
 * - Chaque message entrant est enregistré AVANT l'accusé à Meta ;
 *   l'identifiant Meta dédoublonne les re-livraisons.
 * - Les conversations sont persistées avec expiration (redémarrage sans perte).
 * - Consentement explicite WhatsApp et désabonnement (STOP) matérialisés.
 * - Statuts de livraison fournisseur (WhatsApp, SMS) reportés par
 *   destinataire et canal : « livré » / « lu » uniquement sur confirmation.
 */
@Injectable()
export class BotRelayService {
  private readonly logger = new Logger(BotRelayService.name);

  constructor(private prisma: PrismaService) {}

  /** Enregistre un message entrant. duplicate=true s'il a déjà été reçu. */
  async recordInbound(m: { id: string; from: string; type: string; payload: unknown; channel?: string }) {
    const phone = normalizePhone(m.from);
    try {
      await this.prisma.inboundMessage.create({
        data: { id: m.id, channel: m.channel ?? 'whatsapp', from: phone, type: m.type, payload: m.payload as Prisma.InputJsonValue },
      });
    } catch (e) {
      if ((e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        const existing = await this.prisma.inboundMessage.findUnique({ where: { id: m.id }, select: { status: true } });
        // Re-livraison d'un message non abouti : il peut être retraité
        return { duplicate: existing?.status === InboundStatus.PROCESSED || existing?.status === InboundStatus.IGNORED, status: existing?.status };
      }
      throw e;
    }
    // Fenêtre de conversation WhatsApp (24 h) : ouverte par ce message
    if ((m.channel ?? 'whatsapp') === 'whatsapp') {
      await this.prisma.user.updateMany({ where: { phone }, data: { lastWhatsappInboundAt: new Date() } });
    }
    return { duplicate: false, status: InboundStatus.RECEIVED };
  }

  async markInbound(id: string, status: InboundStatus, error?: string) {
    await this.prisma.inboundMessage.update({
      where: { id },
      data: {
        status, error: error?.slice(0, 500) ?? null, attempts: { increment: 1 },
        processedAt: status === InboundStatus.PROCESSED || status === InboundStatus.IGNORED ? new Date() : undefined,
      },
    });
  }

  /** Messages reçus mais jamais traités (bot redémarré, erreur) : à reprendre. */
  async pendingInbound(limit = 50) {
    return this.prisma.inboundMessage.findMany({
      where: {
        status: { in: [InboundStatus.RECEIVED, InboundStatus.FAILED] },
        attempts: { lt: MAX_INBOUND_ATTEMPTS },
        receivedAt: { lt: new Date(Date.now() - INBOUND_STUCK_MS) },
      },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
  }

  async getSession(phone: string) {
    const s = await this.prisma.botSession.findUnique({ where: { phone: normalizePhone(phone) } });
    if (!s || s.expiresAt < new Date()) return null;
    return s.state;
  }

  async saveSession(phone: string, state: unknown) {
    const p = normalizePhone(phone);
    const expiresAt = new Date(Date.now() + BOT_SESSION_TTL_MS);
    await this.prisma.botSession.upsert({
      where: { phone: p },
      create: { phone: p, state: state as Prisma.InputJsonValue, expiresAt },
      update: { state: state as Prisma.InputJsonValue, expiresAt },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredSessions() {
    await this.prisma.botSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  }

  /**
   * Consentement WhatsApp ou désabonnement. Le compte citoyen doit exister
   * (créé au premier signalement ou à l'inscription) ; sinon il est créé
   * pour porter le choix, sans autre donnée que le numéro et la langue.
   */
  async setConsent(phoneRaw: string, choice: 'WHATSAPP_OPT_IN' | 'OPT_OUT' | 'OPT_IN_AGAIN', source: string, language?: string) {
    const user = await this.ensureCitizen(normalizePhone(phoneRaw), language);
    const now = new Date();
    const data: Prisma.ConsentUncheckedUpdateInput = choice === 'OPT_OUT'
      ? { optedOut: true, optedOutAt: now, optOutSource: source }
      : { optedOut: false, optedOutAt: null, optOutSource: null, whatsappOptInAt: now, whatsappOptInSource: source };
    await this.prisma.consent.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...(data as Prisma.ConsentUncheckedCreateInput) },
      update: data,
    });
    await this.prisma.auditLog.create({ data: { userId: user.id, action: `consent.${choice.toLowerCase()}`, resource: 'user', resourceId: user.id, details: { source } } });
    return { userId: user.id, choice };
  }

  /**
   * Communes proposées au citoyen (zones actives sous la région) : il reçoit
   * les alertes de sa commune et les alertes régionales (audit F09).
   */
  async listCommunes() {
    const root = await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!root) return [];
    const all = await this.prisma.zone.findMany({ where: { isActive: true }, select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } });
    const hasChildren = new Set(all.map((z) => z.parentId).filter(Boolean));
    // Feuilles de l'arbre (communes) ; à défaut, les zones directement sous la région
    const leaves = all.filter((z) => z.id !== root.id && !hasChildren.has(z.id));
    return (leaves.length ? leaves : all.filter((z) => z.parentId === root.id)).map((z) => ({ id: z.id, name: z.name }));
  }

  /** Rattache un citoyen à sa commune (jamais un opérateur : sa zone est son territoire d'autorité). */
  async setCitizenZone(phoneRaw: string, zoneId: string) {
    const phone = normalizePhone(phoneRaw);
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId }, select: { isActive: true } });
    if (!zone?.isActive) return { ok: false, reason: 'zone inconnue' };
    const user = await this.ensureCitizen(phone);
    if (user.role !== 'CITOYEN') return { ok: false, reason: 'compte opérateur' };
    await this.prisma.user.update({ where: { id: user.id }, data: { zoneId } });
    return { ok: true };
  }

  /** Compte citoyen porteur des choix (numéro et langue seulement), créé au besoin. */
  private async ensureCitizen(phone: string, language?: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return existing;
    const root = await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    try {
      return await this.prisma.user.create({ data: { phone, name: `Citoyen ${phone.slice(-4)}`, role: 'CITOYEN', status: 'ACTIVE', isActive: true, language: language ?? 'fr', zoneId: root?.id, lastWhatsappInboundAt: new Date() } });
    } catch (e) {
      if ((e as Prisma.PrismaClientKnownRequestError).code !== 'P2002') throw e;
      return this.prisma.user.findUniqueOrThrow({ where: { phone } });
    }
  }

  async getConsent(phoneRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(phoneRaw) }, select: { language: true, zoneId: true, consents: { select: { optedOut: true, whatsappOptInAt: true } } } });
    const c = user?.consents[0];
    const root = await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    return {
      known: !!user, language: user?.language ?? null, optedOut: !!c?.optedOut, whatsappOptIn: !!c?.whatsappOptInAt && !c?.optedOut,
      /** Commune connue (sinon : rattaché à la région seulement) */
      hasCommune: !!user?.zoneId && user.zoneId !== root?.id,
    };
  }

  /**
   * Statuts fournisseur → lignes de suivi. Progression monotone
   * (envoyé < livré < lu) ; un échec signalé après « envoyé » est conservé
   * avec sa cause. Les compteurs de la diffusion sont recalculés.
   */
  async applyStatuses(statuses: { providerMessageId: string; status: string; timestamp?: string | number; error?: string }[]) {
    const touched = new Set<string>();
    let updated = 0;
    for (const s of statuses) {
      const target = mapProviderStatus(s.status);
      if (!target || !s.providerMessageId) continue;
      const row = await this.prisma.broadcastDelivery.findFirst({ where: { providerMessageId: s.providerMessageId } });
      if (!row) continue;
      const at = s.timestamp ? new Date(Number(s.timestamp) * (String(s.timestamp).length <= 10 ? 1000 : 1)) : new Date();
      if (target === DeliveryStatus.FAILED) {
        if (row.status === DeliveryStatus.DELIVERED || row.status === DeliveryStatus.READ) continue;
        await this.prisma.broadcastDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.FAILED, error: (s.error ?? 'Échec signalé par le fournisseur').slice(0, 500) } });
      } else {
        if ((RANK[row.status] ?? -1) >= (RANK[target] ?? 0)) continue;
        await this.prisma.broadcastDelivery.update({
          where: { id: row.id },
          data: {
            status: target,
            ...(target === DeliveryStatus.DELIVERED || target === DeliveryStatus.READ ? { deliveredAt: row.deliveredAt ?? at } : {}),
            ...(target === DeliveryStatus.READ ? { readAt: at } : {}),
          },
        });
      }
      updated++;
      touched.add(row.broadcastId);
    }
    for (const id of touched) await this.recountDelivered(id);
    return { updated };
  }

  private async recountDelivered(broadcastId: string) {
    const [delivered, sent] = await Promise.all([
      this.prisma.broadcastDelivery.count({ where: { broadcastId, status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.READ] } } }),
      this.prisma.broadcastDelivery.count({ where: { broadcastId, status: { in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.READ] } } }),
    ]);
    await this.prisma.broadcast.update({ where: { id: broadcastId }, data: { deliveredCount: delivered, sentCount: sent } });
  }
}

/** WhatsApp : sent/delivered/read/failed. Africa's Talking SMS : Success/Sent/Buffered/Failed/Rejected. */
export function mapProviderStatus(raw: string): DeliveryStatus | null {
  const s = String(raw || '').toLowerCase();
  if (s === 'sent' || s === 'buffered' || s === 'submitted') return DeliveryStatus.SENT;
  if (s === 'delivered' || s === 'success') return DeliveryStatus.DELIVERED;
  if (s === 'read') return DeliveryStatus.READ;
  if (s === 'failed' || s === 'rejected' || s === 'undelivered') return DeliveryStatus.FAILED;
  return null;
}
