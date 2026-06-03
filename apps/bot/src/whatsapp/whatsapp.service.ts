import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackendService } from '../services/backend.service';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private conversations = new Map<string, { step: string; data: any }>();

  constructor(private cfg: ConfigService, private backend: BackendService) {}

  async handleIncoming(msg: any, metadata: any) {
    const from = msg.from;
    const text = msg.text?.body?.trim().toLowerCase() || '';
    const session = this.conversations.get(from) || { step: 'menu', data: {} };

    this.logger.log(`Message de ${from}: "${text}" (step: ${session.step})`);

    if (text === 'menu' || text === '0' || session.step === 'menu') {
      await this.sendText(from, '🚨 *OLEL – Alerte Précoce*\n\nChoisissez une option:\n1️⃣ Signaler une alerte\n2️⃣ Alertes actives\n3️⃣ Mon statut\n\nRépondez avec le numéro.');
      this.conversations.set(from, { step: 'awaiting_choice', data: {} });
      return;
    }

    if (session.step === 'awaiting_choice') {
      if (text === '1') {
        await this.sendText(from, 'Type d\'alerte:\n1. 🌊 Inondation\n2. 🔥 Incendie\n3. ⚠️ Autre\n\nRépondez avec le numéro.');
        this.conversations.set(from, { step: 'report_type', data: {} });
      } else if (text === '2') {
        const alerts = await this.backend.getActiveAlerts();
        const txt = alerts.length
          ? alerts.slice(0, 5).map((a: any) => `• ${a.title} (${a.zone?.name})`).join('\n')
          : '✅ Aucune alerte active.';
        await this.sendText(from, `*Alertes actives:*\n${txt}`);
        this.conversations.delete(from);
      } else if (text === '3') {
        await this.sendText(from, `ℹ️ Votre numéro: ${from}\nPour modifier votre profil, contactez l'administration.`);
        this.conversations.delete(from);
      }
      return;
    }

    if (session.step === 'report_type') {
      const types: Record<string, string> = { '1': 'INONDATION', '2': 'INCENDIE', '3': 'AUTRE' };
      const type = types[text];
      if (!type) { await this.sendText(from, 'Option invalide. Répondez 1, 2 ou 3.'); return; }
      session.data.type = type;
      await this.sendText(from, 'Décrivez brièvement la situation:');
      this.conversations.set(from, { step: 'report_desc', data: session.data });
      return;
    }

    if (session.step === 'report_desc') {
      session.data.description = msg.text?.body || text;
      try {
        await this.backend.createSignalement({ phone: from, ...session.data });
        await this.sendText(from, '✅ Signalement enregistré! Les autorités ont été notifiées.\n\nTapez *menu* pour recommencer.');
      } catch (e) {
        await this.sendText(from, '❌ Erreur lors du signalement. Réessayez plus tard.\n\nTapez *menu* pour recommencer.');
      }
      this.conversations.delete(from);
    }
  }

  private async sendText(to: string, text: string) {
    const token = this.cfg.get('WHATSAPP_TOKEN', '');
    const phoneId = this.cfg.get('WHATSAPP_PHONE_ID', '');
    if (!token || token.startsWith('EAAx')) {
      this.logger.log(`[SIMUL] → ${to}: ${text.substring(0, 80)}`);
      return;
    }
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
}
