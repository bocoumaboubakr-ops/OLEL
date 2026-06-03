import { Injectable, Logger } from '@nestjs/common';

const USSD_TYPES = [
  { menu: '1. 🌊 Inondation',           value: 'INONDATION' },
  { menu: '2. ☀️ Sécheresse',            value: 'SECHERESSE' },
  { menu: '3. 🔥 Incendie',              value: 'INCENDIE' },
  { menu: '4. 🌪️ Tempête / Vent fort',   value: 'TEMPETE' },
  { menu: '5. 🦠 Épidémie / Maladie',    value: 'EPIDEMIE' },
  { menu: '6. 🦗 Criquets / Nuisibles',  value: 'LOCUSTES' },
  { menu: '7. ⚠️ Autre danger',           value: 'AUTRE' },
];

const SEVERITY_MAP: Record<string, string> = {
  '1': 'VIGILANCE',
  '2': 'ALERTE',
  '3': 'URGENCE',
};

interface UssdSession {
  phone: string;
  data: Record<string, string>;
}

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);
  private sessions = new Map<string, UssdSession>();

  handleSession(sessionId: string, phone: string, text: string, _serviceCode: string): string {
    const parts = text.split('*').filter(Boolean);
    const step = parts.length;

    // Menu principal
    if (step === 0) {
      this.sessions.set(sessionId, { phone, data: {} });
      return 'CON Bienvenue sur OLEL\nAlerte Précoce - Matam\n\n1. Signaler une situation\n2. Alertes actives\n3. Mon profil\n\n0. Quitter';
    }

    if (parts[0] === '0') return 'END Merci d\'utiliser OLEL. Restez vigilant.';

    if (parts[0] === '1') {
      const typeMenu = USSD_TYPES.map((t) => t.menu).join('\n');
      if (step === 1) return `CON Type de risque :\n${typeMenu}`;

      if (step === 2) {
        const idx = parseInt(parts[1]) - 1;
        const chosen = USSD_TYPES[idx];
        if (!chosen) return `CON Type invalide.\n${typeMenu}`;
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        session.data.type = chosen.value;
        this.sessions.set(sessionId, session);
        return 'CON Décrivez brièvement la situation\n(lieu, ampleur) :';
      }

      if (step === 3) {
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        session.data.description = parts[2];
        this.sessions.set(sessionId, session);
        return 'CON Niveau de gravité :\n1. Vigilance\n2. Alerte\n3. Urgence';
      }

      if (step === 4) {
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        session.data.severity = SEVERITY_MAP[parts[3]] || 'ALERTE';
        this.sessions.delete(sessionId);
        this.logger.log(`Signalement USSD de ${phone}: type=${session.data.type} sév=${session.data.severity}`);
        return `END Signalement enregistré.\nType: ${session.data.type}\nGravité: ${session.data.severity}\n\nLes autorités de Matam ont été notifiées. Merci.`;
      }
    }

    if (parts[0] === '2') {
      return 'END Consultez les alertes actives sur WhatsApp OLEL ou contactez la préfecture de Matam.';
    }

    if (parts[0] === '3') {
      return `END Votre numéro: ${phone}\nZone: Matam\nPour toute modification, contactez votre mairie.`;
    }

    return 'END Option non reconnue. Composez à nouveau pour recommencer.';
  }
}
