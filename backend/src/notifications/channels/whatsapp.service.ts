import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChannelNotConfiguredError, PROVIDER_TIMEOUT_MS, SendResult } from './send-result';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly isProd: boolean;

  constructor(private cfg: ConfigService) {
    this.token = cfg.get('WHATSAPP_TOKEN', '');
    this.apiUrl = `https://graph.facebook.com/v19.0/${cfg.get('WHATSAPP_PHONE_ID', '')}/messages`;
    this.isProd = cfg.get('NODE_ENV') === 'production';
  }

  private configured() {
    return !!this.token && !this.token.startsWith('EAAx');
  }

  /** Simulation explicite hors production ; erreur en production (audit F22). */
  private simulate(to: string): SendResult {
    if (this.isProd) throw new ChannelNotConfiguredError('whatsapp');
    this.logger.warn(`[SIMULATION] WhatsApp non configuré — aucun message réel vers ${to.slice(0, -4)}****`);
    return { simulated: true };
  }

  async sendMessage(to: string, text: string): Promise<SendResult> {
    if (!this.configured()) return this.simulate(to);
    const { data } = await axios.post(
      this.apiUrl,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, timeout: PROVIDER_TIMEOUT_MS },
    );
    return { simulated: false, providerMessageId: data?.messages?.[0]?.id };
  }

  async sendTemplate(to: string, templateName: string, languageCode: string, params: string[]): Promise<SendResult> {
    if (!this.configured()) return this.simulate(to);
    const { data } = await axios.post(
      this.apiUrl,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(params.length ? { components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }] } : {}),
        },
      },
      { headers: { Authorization: `Bearer ${this.token}` }, timeout: PROVIDER_TIMEOUT_MS },
    );
    return { simulated: false, providerMessageId: data?.messages?.[0]?.id };
  }
}
