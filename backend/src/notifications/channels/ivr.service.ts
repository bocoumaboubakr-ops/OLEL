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
    const callerId = this.cfg.get<string>('IVR_CALLER_ID');

    if (key === 'sandbox') {
      this.logger.log(`IVR simulé (sandbox) → ${to}`);
      return;
    }
    if (!callerId) {
      this.logger.error('IVR_CALLER_ID non défini — appel IVR annulé (numéro Africa\'s Talking requis)');
      return;
    }

    // Africa's Talking Voice API
    await axios.post(
      'https://voice.africastalking.com/call',
      new URLSearchParams({ username, to, from: callerId }).toString(),
      { headers: { apiKey: key, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }

  // Réponse XML pour le flux IVR (appelé par le webhook AT)
  buildAlertXml(alertTitle: string, alertType: string, zone: string, severity: number): string {
    const sevText = severity >= 3 ? 'Niveau urgence extrême.' : severity === 2 ? 'Niveau alerte.' : 'Niveau vigilance.';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="fr-FR" playBeep="true">
    Alerte précoce OLEL. Région de Matam. ${sevText}
    Situation signalée : ${alertTitle}. Zone concernée : ${zone}.
    Suivez les consignes des autorités locales.
    Pour confirmer la réception de ce message, appuyez sur 1.
    Pour signaler une situation supplémentaire, appuyez sur 2.
  </Say>
  <GetDigits timeout="30" finishOnKey="#">
    <Say>Entrez votre choix suivi du dièse.</Say>
  </GetDigits>
</Response>`;
  }
}
