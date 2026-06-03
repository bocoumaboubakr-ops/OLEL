import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly phoneId: string;

  constructor(private cfg: ConfigService) {
    this.token = cfg.get('WHATSAPP_TOKEN', '');
    this.phoneId = cfg.get('WHATSAPP_PHONE_ID', '');
    this.apiUrl = `https://graph.facebook.com/v19.0/${this.phoneId}/messages`;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.token || this.token.startsWith('EAAx')) {
      this.logger.warn(`WhatsApp non configuré, message simulé vers ${to}`);
      return;
    }
    await axios.post(
      this.apiUrl,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } },
    );
  }

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<void> {
    if (!this.token || this.token.startsWith('EAAx')) return;
    await axios.post(
      this.apiUrl,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'fr' },
          components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }],
        },
      },
      { headers: { Authorization: `Bearer ${this.token}` } },
    );
  }
}
