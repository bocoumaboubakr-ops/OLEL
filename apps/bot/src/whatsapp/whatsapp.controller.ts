import { Controller, Get, Post, Body, Query, Logger, RawBodyRequest, Req, HttpCode, ServiceUnavailableException, ForbiddenException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { BackendService } from '../services/backend.service';
import * as crypto from 'crypto';
import { Request } from 'express';

/** Reprise périodique des messages reçus mais non traités (redémarrage, panne). */
const RECOVERY_INTERVAL_MS = 60_000;

/**
 * Webhook Meta (audit F22, F25).
 *
 * Ordre garanti : signature vérifiée → message ENREGISTRÉ côté backend
 * (dédoublonné par identifiant Meta) → traitement → état final. Si
 * l'enregistrement échoue, le webhook répond 503 : Meta re-livrera le
 * message plus tard, rien n'est perdu. Une erreur de traitement après
 * enregistrement laisse le message « FAILED », repris automatiquement.
 * Les statuts de livraison (sent/delivered/read/failed) sont relayés.
 */
@Controller('webhook/whatsapp')
export class WhatsappController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappController.name);
  private timer?: NodeJS.Timeout;
  private recovering = false;

  constructor(
    private whatsapp: WhatsappService,
    private backend: BackendService,
    private cfg: ConfigService,
  ) {}

  onModuleInit() {
    if (this.cfg.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.recover().catch(() => undefined), RECOVERY_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const expected = this.cfg.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected) {
      this.logger.log('Webhook WhatsApp vérifié');
      return challenge;
    }
    throw new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    if (!this.signatureValid(req)) throw new ForbiddenException('Signature invalide');
    if (body?.object !== 'whatsapp_business_account') return { status: 'ignored' };

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        // Statuts de livraison : « livré » / « lu » seulement sur confirmation Meta (F22)
        const statuses = (value.statuses || []).map((s: any) => ({
          providerMessageId: String(s.id), status: String(s.status), timestamp: s.timestamp ? String(s.timestamp) : undefined,
          error: s.errors?.[0] ? `[${s.errors[0].code}] ${s.errors[0].title ?? s.errors[0].message ?? ''}`.trim() : undefined,
        }));
        try {
          await this.backend.forwardStatuses(statuses);
        } catch (e) {
          this.logger.error(`Statuts non relayés (re-livraison demandée à Meta) : ${(e as Error).message}`);
          throw new ServiceUnavailableException();
        }

        for (const msg of value.messages || []) {
          if (!msg?.id || !msg?.from) continue;
          let duplicate = false;
          try {
            ({ duplicate } = await this.backend.recordInbound({ id: String(msg.id), from: String(msg.from), type: String(msg.type || 'unknown'), payload: msg }));
          } catch (e) {
            // Rien n'est acquitté sans être enregistré
            this.logger.error(`Message ${msg.id} non enregistré (re-livraison demandée à Meta) : ${(e as Error).message}`);
            throw new ServiceUnavailableException();
          }
          if (duplicate) continue;
          await this.process(msg);
        }
      }
    }
    return { status: 'ok' };
  }

  private async process(msg: any) {
    try {
      await this.whatsapp.handleIncoming(msg);
      await this.backend.markInbound(String(msg.id), 'PROCESSED');
    } catch (err) {
      this.logger.error(`Traitement message ${msg.id} échoué (reprise automatique) : ${(err as Error).message}`);
      await this.backend.markInbound(String(msg.id), 'FAILED', (err as Error).message).catch(() => undefined);
    }
  }

  /** Reprend les messages enregistrés mais jamais traités. */
  async recover() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      for (const m of await this.backend.pendingInbound()) await this.process(m.payload);
    } finally {
      this.recovering = false;
    }
  }

  private signatureValid(req: RawBodyRequest<Request>): boolean {
    const appSecret = this.cfg.get<string>('WHATSAPP_APP_SECRET', '');
    if (!appSecret) {
      if (this.cfg.get('NODE_ENV') === 'production') {
        this.logger.error('WHATSAPP_APP_SECRET non défini en production — webhook rejeté');
        return false;
      }
      return true;
    }
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) return false; // header absent = requête forgée
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody || '').digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}
