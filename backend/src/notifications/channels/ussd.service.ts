import { Injectable, Logger } from '@nestjs/common';

interface UssdSession {
  phone: string;
  step: number;
  data: Record<string, string>;
}

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);
  private sessions = new Map<string, UssdSession>();

  handleSession(sessionId: string, phone: string, text: string, serviceCode: string): string {
    const parts = text.split('*').filter(Boolean);
    const step = parts.length;

    if (step === 0) {
      this.sessions.set(sessionId, { phone, step: 1, data: {} });
      return 'CON Bienvenue sur OLEL\n1. Signaler une alerte\n2. Consulter alertes actives\n3. Mon profil';
    }

    const session = this.sessions.get(sessionId) || { phone, step, data: {} };

    if (parts[0] === '1') {
      if (step === 1) return 'CON Type d\'alerte:\n1. Inondation\n2. Incendie\n3. Autre';
      if (step === 2) {
        session.data.type = ['INONDATION', 'INCENDIE', 'AUTRE'][parseInt(parts[1]) - 1] || 'AUTRE';
        return 'CON Décrivez la situation (courte description):';
      }
      if (step === 3) {
        session.data.description = parts[2];
        this.sessions.delete(sessionId);
        this.logger.log(`Signalement USSD de ${phone}: ${JSON.stringify(session.data)}`);
        return 'END Signalement reçu. Merci. Les autorités sont alertées.';
      }
    }

    if (parts[0] === '2') {
      return 'END Aucune alerte active dans votre zone pour le moment.';
    }

    if (parts[0] === '3') {
      return `END Votre numéro: ${phone}\nPour modifier votre profil, contactez votre mairie.`;
    }

    return 'END Option invalide. Veuillez recommencer.';
  }
}
