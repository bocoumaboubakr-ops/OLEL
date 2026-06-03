import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackendService } from '../services/backend.service';
import axios from 'axios';

const RISK_TYPES = [
  { code: '1', value: 'INONDATION',           label: '🌊 Inondation' },
  { code: '2', value: 'SECHERESSE',            label: '☀️ Sécheresse' },
  { code: '3', value: 'INCENDIE',              label: '🔥 Incendie' },
  { code: '4', value: 'TEMPETE',               label: '🌪️ Tempête / Vent fort' },
  { code: '5', value: 'EPIDEMIE',              label: '🦠 Épidémie / Maladie' },
  { code: '6', value: 'LOCUSTES',              label: '🦗 Criquets / Nuisibles' },
  { code: '7', value: 'MOUVEMENT_DE_TERRAIN',  label: '⛰️ Mouvement de terrain' },
  { code: '8', value: 'AUTRE',                 label: '⚠️ Autre danger' },
];

const TYPES_MENU = RISK_TYPES.map((t) => `${t.code}. ${t.label}`).join('\n');

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private conversations = new Map<string, { step: string; data: any }>();

  constructor(private cfg: ConfigService, private backend: BackendService) {}

  async handleIncoming(msg: any, _metadata: any) {
    const from = msg.from;
    const raw = msg.text?.body?.trim() || '';
    const text = raw.toLowerCase();
    const session = this.conversations.get(from) || { step: 'menu', data: {} };

    this.logger.log(`Message de ${from}: "${raw}" (step: ${session.step})`);

    // Mot-clé de réinitialisation
    if (text === 'menu' || text === '0' || text === 'stop' || text === 'aide') {
      await this.showMainMenu(from);
      return;
    }

    if (session.step === 'menu' || session.step === 'awaiting_choice') {
      if (session.step === 'menu') {
        await this.showMainMenu(from);
        return;
      }

      if (text === '1') {
        await this.sendText(from, `📋 *Type de risque à signaler :*\n\n${TYPES_MENU}\n\nRépondez avec le numéro (1-8).`);
        this.conversations.set(from, { step: 'report_type', data: {} });
      } else if (text === '2') {
        const alerts = await this.backend.getActiveAlerts();
        if (!alerts.length) {
          await this.sendText(from, '✅ Aucune alerte active dans votre zone pour le moment.\n\nTapez *menu* pour revenir.');
        } else {
          const list = alerts.slice(0, 5).map((a: any) => `• *${a.title}*\n  📍 ${a.zone?.name || 'Zone inconnue'} — ${a.status}`).join('\n\n');
          await this.sendText(from, `🚨 *Alertes actives (${alerts.length}) :*\n\n${list}\n\nTapez *menu* pour revenir.`);
        }
        this.conversations.delete(from);
      } else if (text === '3') {
        await this.sendText(from, `ℹ️ *Votre compte OLEL*\n\nNuméro enregistré : ${from}\n\nPour toute modification, contactez votre mairie ou la préfecture de Matam.\n\nTapez *menu* pour revenir.`);
        this.conversations.delete(from);
      } else {
        await this.sendText(from, '❓ Option non reconnue. Répondez *1*, *2* ou *3*, ou tapez *menu*.');
      }
      return;
    }

    if (session.step === 'report_type') {
      const found = RISK_TYPES.find((t) => t.code === raw.trim());
      if (!found) {
        await this.sendText(from, `Option invalide. Répondez avec un numéro de 1 à ${RISK_TYPES.length}.`);
        return;
      }
      session.data.type = found.value;
      session.data.typeLabel = found.label;
      await this.sendText(from, `${found.label} sélectionné.\n\nDécrivez la situation : lieu précis, ampleur, personnes touchées.`);
      this.conversations.set(from, { step: 'report_desc', data: session.data });
      return;
    }

    if (session.step === 'report_desc') {
      session.data.description = raw;
      await this.sendText(from, `Niveau de gravité :\n1. 🟢 Vigilance (surveiller)\n2. 🟡 Alerte (agir rapidement)\n3. 🔴 Urgence (danger immédiat)\n\nRépondez 1, 2 ou 3.`);
      this.conversations.set(from, { step: 'report_severity', data: session.data });
      return;
    }

    if (session.step === 'report_severity') {
      const severityMap: Record<string, number> = { '1': 1, '2': 2, '3': 3 };
      const sev = severityMap[raw.trim()];
      if (!sev) {
        await this.sendText(from, 'Répondez 1, 2 ou 3.');
        return;
      }
      session.data.severity = sev;

      try {
        await this.backend.createSignalement({
          phone: from,
          type: session.data.type,
          description: session.data.description,
          severity: sev,
        });
        await this.sendText(from, `✅ *Signalement enregistré !*\n\nType : ${session.data.typeLabel}\nGravité : ${{ 1: '🟢 Vigilance', 2: '🟡 Alerte', 3: '🔴 Urgence' }[sev]}\n\nLes autorités compétentes ont été notifiées. Merci pour votre vigilance.\n\nTapez *menu* pour recommencer.`);
      } catch {
        await this.sendText(from, '❌ Erreur lors de l\'enregistrement. Réessayez plus tard.\n\nTapez *menu* pour recommencer.');
      }
      this.conversations.delete(from);
    }
  }

  private async showMainMenu(from: string) {
    await this.sendText(
      from,
      '🚨 *OLEL – Alerte Précoce Multi-Risques*\n_Région de Matam_\n\n1️⃣ Signaler une situation\n2️⃣ Consulter les alertes actives\n3️⃣ Mon profil\n\nRépondez avec le numéro ou tapez *menu* à tout moment.',
    );
    this.conversations.set(from, { step: 'awaiting_choice', data: {} });
  }

  async sendMessage(to: string, text: string): Promise<void> {
    return this.sendText(to, text);
  }

  private async sendText(to: string, text: string) {
    const token = this.cfg.get('WHATSAPP_TOKEN', '');
    const phoneId = this.cfg.get('WHATSAPP_PHONE_ID', '');
    if (!token || token.startsWith('EAAx')) {
      this.logger.log(`[SIMUL → ${to}] ${text.replace(/\n/g, ' | ').substring(0, 120)}`);
      return;
    }
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
  }
}
