import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private cfg: ConfigService) {}

  async sendSms(to: string, message: string): Promise<void> {
    const key = this.cfg.get('AFRICAS_TALKING_KEY', 'sandbox');
    const username = this.cfg.get('AFRICAS_TALKING_USER', 'sandbox');

    if (key === 'sandbox') {
      this.logger.log(`SMS simulé (sandbox) → ${to}: ${message.substring(0, 50)}...`);
      return;
    }

    await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({ username, to, message, from: 'OLEL' }).toString(),
      {
        headers: {
          apiKey: key,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  }
}
