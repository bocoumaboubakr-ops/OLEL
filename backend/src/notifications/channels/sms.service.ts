import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChannelNotConfiguredError, PROVIDER_TIMEOUT_MS, SendResult } from './send-result';

/** Codes Africa's Talking indiquant une prise en charge (100 Processed, 101 Sent, 102 Queued). */
const AT_ACCEPTED = new Set([100, 101, 102]);

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private cfg: ConfigService) {}

  async sendSms(to: string, message: string): Promise<SendResult> {
    const key = this.cfg.get('AFRICAS_TALKING_KEY', 'sandbox');
    const username = this.cfg.get('AFRICAS_TALKING_USER', 'sandbox');

    if (key === 'sandbox') {
      if (this.cfg.get('NODE_ENV') === 'production') throw new ChannelNotConfiguredError('sms');
      this.logger.warn(`[SIMULATION] SMS sandbox — aucun SMS réel vers ${to.slice(0, -4)}****`);
      return { simulated: true };
    }

    const { data } = await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({ username, to, message, from: this.cfg.get('SMS_SENDER_ID', 'OLEL') }).toString(),
      {
        headers: { apiKey: key, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: PROVIDER_TIMEOUT_MS,
      },
    );
    // Une réponse HTTP 201 peut contenir un refus par destinataire : on le vérifie.
    const rcpt = data?.SMSMessageData?.Recipients?.[0];
    if (!rcpt || !AT_ACCEPTED.has(Number(rcpt.statusCode))) {
      throw new Error(`SMS refusé par le fournisseur : ${rcpt?.status || data?.SMSMessageData?.Message || 'réponse inattendue'}`);
    }
    return { simulated: false, providerMessageId: rcpt.messageId };
  }
}
