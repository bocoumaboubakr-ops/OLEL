import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IvrService {
  private readonly logger = new Logger(IvrService.name);

  constructor(private cfg: ConfigService) {}

  async makeCall(to: string, message: string): Promise<void> {
    const key = this.cfg.get('AFRICAS_TALKING_KEY', 'sandbox');
    const username = this.cfg.get('AFRICAS_TALKING_USER', 'sandbox');

    if (key === 'sandbox') {
      this.logger.log(`IVR simulé (sandbox) → ${to}`);
      return;
    }

    // Africa's Talking Voice API
    await axios.post(
      'https://voice.africastalking.com/call',
      new URLSearchParams({ username, to, from: '+221XXXXXXXXX' }).toString(),
      { headers: { apiKey: key, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }

  // Réponse XML pour le flux IVR (appelé par le webhook AT)
  buildAlertXml(alertTitle: string, zone: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="fr-FR" playBeep="true">
    Alerte OLEL. ${alertTitle}. Zone : ${zone}.
    Pour confirmer la réception, appuyez sur 1.
    Pour signaler une urgence supplémentaire, appuyez sur 2.
  </Say>
  <GetDigits timeout="30" finishOnKey="#">
    <Say>Entrez votre choix suivi du dièse.</Say>
  </GetDigits>
</Response>`;
  }
}
