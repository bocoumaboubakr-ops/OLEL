import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SignalementsService } from '../signalements/signalements.service';
import { AlertsService } from '../alerts/alerts.service';
import { pilotAudienceAllowed } from '../common/pilot/pilot-mode';

const USSD_TYPES = [
  { menu: '1. Inondation',           value: 'INONDATION' },
  { menu: '2. Secheresse',           value: 'SECHERESSE' },
  { menu: '3. Incendie',             value: 'INCENDIE' },
  { menu: '4. Tempete / Vent fort',  value: 'TEMPETE' },
  { menu: '5. Epidemie / Maladie',   value: 'EPIDEMIE' },
  { menu: '6. Criquets / Nuisibles', value: 'LOCUSTES' },
  { menu: '7. Autre danger',         value: 'AUTRE' },
];

const SEVERITY: Record<string, { value: number; label: string }> = {
  '1': { value: 1, label: 'Vigilance' },
  '2': { value: 2, label: 'Alerte' },
  '3': { value: 3, label: 'Urgence' },
};

/** Écran USSD : ~180 caractères utiles. */
const MAX_SCREEN = 180;

/**
 * Menu USSD (Africa's Talking) — audit F06, F16.
 *
 * Sans état côté serveur : le fournisseur renvoie à chaque requête toute la
 * saisie (« 1*2*description*3 »), ce qui survit à un redémarrage.
 *
 * La confirmation n'est affichée qu'APRÈS l'écriture en base du signalement
 * et dit exactement ce qui s'est passé : « reçu par OLEL, en attente d'examen
 * par un opérateur ». Rien n'annonce une intervention ou une notification des
 * autorités. Une même session rejouée par le fournisseur ne crée qu'un
 * signalement (référence `ussd:<sessionId>`).
 */
@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(
    private prisma: PrismaService,
    private signalements: SignalementsService,
    private alerts: AlertsService,
  ) {}

  async handleSession(sessionId: string, phone: string, text: string): Promise<string> {
    const parts = (text || '').split('*').filter(Boolean);
    const step = parts.length;

    if (step === 0) {
      return 'CON Bienvenue sur OLEL\nAlerte Precoce - Matam\n\n1. Signaler une situation\n2. Alertes en vigueur\n3. Mon profil\n\n0. Quitter';
    }
    if (parts[0] === '0') return 'END Merci d\'utiliser OLEL. Restez vigilant.';
    if (parts[0] === '1') return this.report(sessionId, phone, parts);
    if (parts[0] === '2') return this.activeAlerts(phone);
    if (parts[0] === '3') return this.profile(phone);
    return 'END Option non reconnue. Composez a nouveau pour recommencer.';
  }

  private async report(sessionId: string, phone: string, parts: string[]): Promise<string> {
    const typeMenu = USSD_TYPES.map((t) => t.menu).join('\n');
    if (parts.length === 1) return `CON Type de risque :\n${typeMenu}`;

    const chosen = USSD_TYPES[parseInt(parts[1], 10) - 1];
    if (!chosen) return 'END Choix invalide. Rien n\'a ete enregistre.\nComposez a nouveau pour recommencer.';
    if (parts.length === 2) return 'CON Decrivez brievement la situation\n(lieu, ampleur) :';
    if (parts.length === 3) return 'CON Niveau de gravite :\n1. Vigilance\n2. Alerte\n3. Urgence';

    const severity = SEVERITY[parts[parts.length - 1]];
    if (!severity) return 'END Choix invalide. Rien n\'a ete enregistre.\nComposez a nouveau pour recommencer.';
    const description = parts.slice(2, -1).join('*').trim();

    try {
      const s = await this.signalements.createFromChannel({
        channel: 'ussd', sourceRef: `ussd:${sessionId}`, phone,
        type: chosen.value, severity: severity.value,
        description: description || `Signalement ${chosen.value} via USSD`,
      });
      this.logger.log(`Signalement USSD ${s.duplicate ? 'deja recu' : 'enregistre'} : ${s.id}`);
      return `END Signalement recu par OLEL.\nRef: ${s.id.slice(0, 8).toUpperCase()}\nIl sera examine par un operateur.\nOLEL ne remplace pas les secours : en cas de danger immediat, contactez-les.`;
    } catch (e) {
      this.logger.error(`Échec d'enregistrement USSD (session ${sessionId}) : ${(e as Error).message}`);
      return 'END ECHEC : votre signalement n\'a PAS ete recu.\nReessayez plus tard. En cas de danger immediat, contactez directement les secours.';
    }
  }

  /** Consultation : distingue « aucune alerte » et « consultation indisponible » (F16). */
  private async activeAlerts(phone: string): Promise<string> {
    if (!pilotAudienceAllowed(phone)) {
      return 'END Service OLEL en phase d\'essai : la consultation des alertes n\'est pas encore ouverte.\nEn cas de danger, suivez les consignes des autorites locales.';
    }
    try {
      const user = await this.prisma.user.findUnique({ where: { phone }, select: { zoneId: true } });
      const list = await this.alerts.publicActiveFor(user?.zoneId, 3);
      if (!list.length) return 'END Aucune alerte en vigueur pour votre zone actuellement.';
      let out = `END Alertes en vigueur (${list.length}) :`;
      for (const [i, a] of list.entries()) {
        const line = `\n${i + 1}. [${a.alertLevel}] ${a.title}${a.zone ? ` - ${a.zone.name}` : ''}`;
        if ((out + line).length > MAX_SCREEN) break;
        out += line;
      }
      return out;
    } catch (e) {
      this.logger.error(`Consultation USSD indisponible : ${(e as Error).message}`);
      return 'END Consultation indisponible pour le moment.\nCela ne veut PAS dire qu\'il n\'y a pas d\'alerte. Reessayez plus tard.';
    }
  }

  private async profile(phone: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({ where: { phone }, select: { zone: { select: { name: true } } } });
      return `END Votre numero : ${phone}\nZone : ${user?.zone?.name ?? 'non renseignee'}\nPour toute modification, contactez votre mairie.`;
    } catch {
      return 'END Profil indisponible pour le moment. Reessayez plus tard.';
    }
  }
}
