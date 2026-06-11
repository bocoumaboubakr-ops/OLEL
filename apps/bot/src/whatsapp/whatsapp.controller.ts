import { Controller, Get, Post, Body, Query, Logger, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import * as crypto from 'crypto';
import { Request } from 'express';

@Controller('webhook/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private whatsapp: WhatsappService,
    private cfg: ConfigService,
  ) {}

  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const expected = this.cfg.get('WHATSAPP_VERIFY_TOKEN', 'olel_webhook_secret');
    if (mode === 'subscribe' && token === expected) {
      this.logger.log('Webhook WhatsApp vérifié');
      return challenge;
    }
    return 'Forbidden';
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = this.cfg.get('WHATSAPP_APP_SECRET', '');

    if (appSecret) {
      // Header absent = requête forgée : on rejette (sinon bypass trivial du HMAC)
      if (!signature) {
        this.logger.warn('Webhook sans signature HMAC — rejeté');
        return;
      }
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody || '').digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        this.logger.warn('Signature HMAC invalide');
        return;
      }
    } else if (this.cfg.get('NODE_ENV') === 'production') {
      this.logger.error('WHATSAPP_APP_SECRET non défini en production — webhook rejeté');
      return;
    }

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          for (const msg of change.value?.messages || []) {
            try {
              await this.whatsapp.handleIncoming(msg, change.value?.metadata);
            } catch (err) {
              // Toujours répondre 200 à Meta, sinon le message est re-livré en boucle
              this.logger.error(`Traitement message ${msg?.id ?? '?'} échoué : ${(err as Error).message}`);
            }
          }
        }
      }
    }

    return { status: 'ok' };
  }
}
