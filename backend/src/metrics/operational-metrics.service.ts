import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AlertStatus, BroadcastStatus, InboundStatus, SignalementStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { MetricsService } from './metrics.service';

const age = (d?: Date | null) => (d ? Math.max(0, (Date.now() - d.getTime()) / 1000) : 0);

/**
 * Indicateurs de la chaîne d'alerte (audit F33) : ce qui doit déclencher une
 * intervention humaine, pas seulement l'état technique du serveur.
 */
@Injectable()
export class OperationalMetricsService implements OnModuleInit {
  constructor(private metrics: MetricsService, private prisma: PrismaService, @InjectQueue('notifications') private queue: Queue) {}

  onModuleInit() {
    const m = this.metrics;
    m.gauge('olel_signalement_pending_oldest_age_seconds', 'Âge du plus ancien signalement non traité', [], async (g) => {
      const s = await this.prisma.signalement.findFirst({ where: { status: SignalementStatus.PENDING }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      g.set(age(s?.createdAt));
    });
    m.gauge('olel_signalement_pending', 'Signalements en attente d\'examen', [], async (g) => {
      g.set(await this.prisma.signalement.count({ where: { status: SignalementStatus.PENDING } }));
    });
    m.gauge('olel_alert_awaiting_decision_oldest_age_seconds', 'Âge de la plus ancienne alerte ouverte non diffusée', [], async (g) => {
      const a = await this.prisma.alert.findFirst({
        where: { status: { in: [AlertStatus.PENDING, AlertStatus.UNDER_REVIEW, AlertStatus.VALIDATED] }, broadcastAt: null },
        orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      });
      g.set(age(a?.createdAt));
    });
    m.gauge('olel_broadcast_open', 'Intentions de diffusion non terminées', ['status'], async (g) => {
      for (const status of [BroadcastStatus.PENDING, BroadcastStatus.DISPATCHING]) {
        g.set({ status }, await this.prisma.broadcast.count({ where: { status } }));
      }
    });
    m.gauge('olel_broadcast_open_oldest_age_seconds', 'Âge de la plus ancienne intention de diffusion non terminée', [], async (g) => {
      const b = await this.prisma.broadcast.findFirst({ where: { status: { in: [BroadcastStatus.PENDING, BroadcastStatus.DISPATCHING] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      g.set(age(b?.createdAt));
    });
    m.gauge('olel_broadcast_finished_24h', 'Diffusions terminées sur 24 h par statut final', ['status'], async (g) => {
      const since = new Date(Date.now() - 86400_000);
      for (const status of [BroadcastStatus.DONE, BroadcastStatus.PARTIAL, BroadcastStatus.FAILED, BroadcastStatus.CANCELLED]) {
        g.set({ status }, await this.prisma.broadcast.count({ where: { status, completedAt: { gte: since } } }));
      }
    });
    m.gauge('olel_delivery_24h', 'Remises sur 24 h par canal et statut (envoyé ≠ livré)', ['channel', 'status'], async (g) => {
      g.reset();
      const rows = await this.prisma.broadcastDelivery.groupBy({ by: ['channel', 'status'], where: { updatedAt: { gte: new Date(Date.now() - 86400_000) } }, _count: true });
      for (const r of rows) g.set({ channel: r.channel, status: r.status }, r._count);
    });
    m.gauge('olel_queue_jobs', 'Tâches de la file de diffusion', ['state'], async (g) => {
      try {
        const c = await this.queue.getJobCounts();
        for (const [state, n] of Object.entries(c)) g.set({ state }, n as number);
        g.set({ state: 'redis_up' }, 1);
      } catch {
        g.set({ state: 'redis_up' }, 0);
      }
    });
    m.gauge('olel_inbound_unprocessed', 'Messages entrants enregistrés mais non traités', [], async (g) => {
      g.set(await this.prisma.inboundMessage.count({ where: { status: { in: [InboundStatus.RECEIVED, InboundStatus.FAILED] } } }));
    });
    m.gauge('olel_bypass_unreviewed', 'Diffusions d\'urgence sans revue a posteriori', [], async (g) => {
      g.set(await this.prisma.alert.count({ where: { emergencyBypass: true, bypassReviewedAt: null } }));
    });
    m.gauge('olel_channel_configured', 'Canal configuré avec des identifiants fournisseur (1) ou non (0)', ['channel'], async (g) => {
      g.set({ channel: 'whatsapp' }, process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID ? 1 : 0);
      g.set({ channel: 'sms' }, process.env.AFRICAS_TALKING_KEY && process.env.AFRICAS_TALKING_KEY !== 'sandbox' ? 1 : 0);
    });
  }
}
