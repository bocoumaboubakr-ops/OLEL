import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { HealthCheck, HealthCheckError, HealthCheckService, HealthIndicatorResult, PrismaHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bull';
import { BroadcastStatus, InboundStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { pilotModeInfo } from '../common/pilot/pilot-mode';

/** Au-delà, une intention de diffusion non remise à la file signale une panne. */
const PENDING_BROADCAST_MAX_AGE_MS = 5 * 60_000;
/** Au-delà, une diffusion en cours est considérée bloquée. */
const DISPATCHING_MAX_AGE_MS = 20 * 60_000;
const INBOUND_MAX_AGE_MS = 10 * 60_000;

/**
 * Santé (audit F33). « ready » : base ET Redis. « diffusion » : la chaîne
 * d'alerte peut-elle réellement diffuser ? (Redis, file non bloquée,
 * fournisseurs configurés en production, réception non en souffrance).
 * Un serveur « sain » mais incapable de diffuser répond 503.
 */
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaIndicator: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private prisma: PrismaService,
    @InjectQueue('notifications') private queue: Queue,
  ) {}

  @Get('live')
  @HealthCheck()
  liveness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.redis(),
    ]);
  }

  @Get('diffusion')
  @HealthCheck()
  @ApiOperation({ summary: 'La chaîne de diffusion est-elle opérationnelle ? (503 sinon)' })
  diffusion() {
    return this.health.check([
      () => this.redis(),
      () => this.broadcastQueue(),
      () => this.providers(),
      () => this.inbound(),
    ]);
  }

  private async redis(): Promise<HealthIndicatorResult> {
    try {
      const pong = await Promise.race([
        this.queue.client.ping(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), 2000)),
      ]);
      return { redis: { status: 'up', pong } };
    } catch (e) {
      throw new HealthCheckError('Redis indisponible', { redis: { status: 'down', error: (e as Error).message } });
    }
  }

  private async broadcastQueue(): Promise<HealthIndicatorResult> {
    const now = Date.now();
    const [oldestPending, stuck] = await Promise.all([
      this.prisma.broadcast.findFirst({ where: { status: BroadcastStatus.PENDING }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, lastError: true } }),
      this.prisma.broadcast.count({ where: { status: BroadcastStatus.DISPATCHING, dispatchedAt: { lt: new Date(now - DISPATCHING_MAX_AGE_MS) } } }),
    ]);
    const pendingAge = oldestPending ? now - oldestPending.createdAt.getTime() : 0;
    const details = { oldestPendingSeconds: Math.round(pendingAge / 1000), stuckDispatching: stuck, lastError: oldestPending?.lastError ?? null };
    if (pendingAge > PENDING_BROADCAST_MAX_AGE_MS || stuck > 0) {
      throw new HealthCheckError('Diffusions en attente ou bloquées', { broadcastQueue: { status: 'down', ...details } });
    }
    return { broadcastQueue: { status: 'up', ...details } };
  }

  private async providers(): Promise<HealthIndicatorResult> {
    const whatsapp = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
    const sms = !!(process.env.AFRICAS_TALKING_KEY && process.env.AFRICAS_TALKING_KEY !== 'sandbox');
    const details = { whatsapp: whatsapp ? 'configuré' : 'non configuré', sms: sms ? 'configuré' : 'non configuré', ...pilotModeInfo() };
    if (process.env.NODE_ENV === 'production' && !whatsapp && !sms) {
      throw new HealthCheckError('Aucun canal de diffusion configuré', { providers: { status: 'down', ...details } });
    }
    return { providers: { status: 'up', ...details } };
  }

  private async inbound(): Promise<HealthIndicatorResult> {
    const oldest = await this.prisma.inboundMessage.findFirst({
      where: { status: { in: [InboundStatus.RECEIVED, InboundStatus.FAILED] } }, orderBy: { receivedAt: 'asc' }, select: { receivedAt: true },
    });
    const ageMs = oldest ? Date.now() - oldest.receivedAt.getTime() : 0;
    if (ageMs > INBOUND_MAX_AGE_MS) {
      throw new HealthCheckError('Messages entrants non traités', { inbound: { status: 'down', oldestUnprocessedSeconds: Math.round(ageMs / 1000) } });
    }
    return { inbound: { status: 'up', oldestUnprocessedSeconds: Math.round(ageMs / 1000) } };
  }
}
