import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChannelNotConfiguredError, PROVIDER_TIMEOUT_MS, SendResult } from './send-result';

/**
 * Appels sortants Africa's Talking Voice. Le SVI n'est pas un canal de
 * diffusion d'alerte en service (audit F26) : seuls des appels de test
 * administrateur sont possibles, et leur statut est rapporté tel quel.
 */
@Injectable()
export class IvrService {
  private readonly logger = new Logger(IvrService.name);

  constructor(private cfg: ConfigService) {}

  async makeCall(to: string): Promise<SendResult> {
    const key = this.cfg.get('AFRICAS_TALKING_KEY', 'sandbox');
    const username = this.cfg.get('AFRICAS_TALKING_USER', 'sandbox');
    const callerId = this.cfg.get<string>('IVR_CALLER_ID');

    if (key === 'sandbox' || !callerId) {
      if (process.env.NODE_ENV === 'production') {
        throw new ChannelNotConfiguredError('SVI non configuré (AFRICAS_TALKING_KEY / IVR_CALLER_ID)');
      }
      this.logger.log(`SVI simulé → ${to.slice(0, -4)}****`);
      return { simulated: true };
    }

    const { data } = await axios.post(
      'https://voice.africastalking.com/call',
      new URLSearchParams({ username, to, from: callerId }).toString(),
      { headers: { apiKey: key, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: PROVIDER_TIMEOUT_MS },
    );
    const entry = data?.entries?.[0];
    if (!entry || entry.status !== 'Queued') {
      throw new Error(`Appel refusé par le fournisseur : ${entry?.status ?? data?.errorMessage ?? 'réponse inattendue'}`);
    }
    return { simulated: false, providerMessageId: entry.sessionId };
  }

  /** Invite neutre : aucune alerte n'est lue tant qu'aucune n'est associée à l'appel. */
  buildWelcomeXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="20" finishOnKey="#">
    <Say voice="fr-FR">Bienvenue sur le service vocal OLEL. Pour signaler une situation dangereuse, appuyez sur 2 puis dièse. Pour quitter, appuyez sur 1 puis dièse.</Say>
  </GetDigits>
  <Say voice="fr-FR">Aucun choix reçu. Au revoir.</Say>
</Response>`;
  }
}
