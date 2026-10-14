import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import { BroadcastStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** Tentatives Bull par intention : reprises bornées des destinataires en échec. */
export const DISPATCH_ATTEMPTS = 4;
/** Au-delà, une intention DISPATCHING sans fin est considérée bloquée et relancée. */
const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Répartiteur durable (outbox, audit F23).
 *
 * La décision et l'intention de diffusion sont écrites dans la MÊME
 * transaction (statut PENDING). Ce service les remet à la file Bull :
 *  - immédiatement après la décision (`kick`) ;
 *  - puis toutes les 30 s pour toute intention restée PENDING (Redis
 *    indisponible au moment de la décision) ou bloquée en DISPATCHING.
 * Une panne Redis retarde donc la diffusion sans jamais la perdre.
 */
@Injectable()
export class BroadcastDispatcher {
  private readonly logger = new Logger(BroadcastDispatcher.name);

  constructor(private prisma: PrismaService, @InjectQueue('notifications') private queue: Queue) {}

  /** Remet une intention PENDING à la file. Sans effet si elle a déjà été remise. */
  async kick(broadcastId: string): Promise<boolean> {
    try {
      await this.queue.add('dispatch', { broadcastId }, {
        jobId: broadcastId, // identifiant stable : Bull ignore un second ajout
        attempts: DISPATCH_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: false,
      });
    } catch (e) {
      const msg = `File indisponible : ${(e as Error).message}`;
      this.logger.error(`Intention ${broadcastId} non remise (${msg}) — reprise automatique`);
      await this.prisma.broadcast.updateMany({ where: { id: broadcastId, status: BroadcastStatus.PENDING }, data: { lastError: msg } }).catch(() => undefined);
      return false;
    }
    await this.prisma.broadcast.updateMany({
      where: { id: broadcastId, status: BroadcastStatus.PENDING },
      data: { status: BroadcastStatus.DISPATCHING, dispatchedAt: new Date(), lastError: null },
    });
    return true;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<number> {
    const pending = await this.prisma.broadcast.findMany({
      where: { status: BroadcastStatus.PENDING },
      select: { id: true }, take: 100, orderBy: { createdAt: 'asc' },
    });
    let n = 0;
    for (const b of pending) if (await this.kick(b.id)) n++;

    const stuck = await this.prisma.broadcast.findMany({
      where: { status: BroadcastStatus.DISPATCHING, dispatchedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      select: { id: true }, take: 50,
    });
    for (const b of stuck) {
      // Tâche perdue (Redis vidé…) : nouvel identifiant, le traitement est idempotent par destinataire
      try {
        await this.queue.add('dispatch', { broadcastId: b.id }, {
          jobId: `${b.id}:relance:${Date.now()}`, attempts: DISPATCH_ATTEMPTS, backoff: { type: 'exponential', delay: 5000 },
        });
        await this.prisma.broadcast.update({ where: { id: b.id }, data: { dispatchedAt: new Date() } });
        n++;
      } catch { /* Redis toujours indisponible : prochain balayage */ }
    }
    return n;
  }
}
