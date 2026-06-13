import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackendService } from '../services/backend.service';
import axios from 'axios';
import { Lang, t, riskMenu, RISK_ORDER, RISK_LABELS, DICT } from './i18n';

// Préfixe de diffusion selon le niveau d'alerte officiel (lecture des alertes)
const LEVEL_PREFIX: Record<string, string> = {
  BLEU: 'ℹ️ INFORMATION', JAUNE: '⚠️ VIGILANCE', ORANGE: '🔶 PRÉ-ALERTE',
  ROUGE: '🚨 URGENCE', ROUGE_FONCE: '🔴 CRISE MAJEURE',
};
export function levelPrefix(level?: string): string {
  return LEVEL_PREFIX[level || 'BLEU'] || LEVEL_PREFIX.BLEU;
}

interface Session {
  step: string;
  lang?: Lang;
  data: any;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private conversations = new Map<string, Session>();

  constructor(private cfg: ConfigService, private backend: BackendService) {}

  async handleIncoming(msg: any, _metadata: any) {
    const from = msg.from;
    const raw = msg.text?.body?.trim() || '';
    const text = raw.toLowerCase();
    const session = this.conversations.get(from) || { step: 'choose_lang', data: {} };
    const lang: Lang = session.lang || 'fr';

    this.logger.log(`Message de ${from}: "${raw}" (step: ${session.step}, lang: ${session.lang || '-'})`);

    // ── Choix de langue au tout premier contact (ou commande "langue") ──
    if (!session.lang || session.step === 'choose_lang') {
      await this.sendText(from, DICT.fr.chooseLang);
      this.conversations.set(from, { step: 'awaiting_lang', data: {} });
      return;
    }
    if (session.step === 'awaiting_lang') {
      const map: Record<string, Lang> = { '1': 'fr', '2': 'ff', '3': 'wo', '4': 'snk' };
      const chosen = map[raw.trim()];
      if (!chosen) {
        await this.sendText(from, DICT.fr.chooseLang);
        return;
      }
      this.conversations.set(from, { step: 'awaiting_choice', lang: chosen, data: {} });
      await this.sendText(from, t(chosen).menu);
      return;
    }

    // Commandes globales
    if (text === 'langue' || text === 'lang' || text === 'ɗemngal' || text === 'làkk') {
      await this.sendText(from, DICT.fr.chooseLang);
      this.conversations.set(from, { step: 'awaiting_lang', data: {} });
      return;
    }
    if (text === 'menu' || text === '0' || text === 'stop' || text === 'aide') {
      await this.showMainMenu(from, lang);
      return;
    }

    const tr = t(lang);

    if (session.step === 'awaiting_choice') {
      if (text === '1') {
        await this.sendText(from, `${tr.reportTypePrompt}\n\n${riskMenu(lang)}`);
        this.conversations.set(from, { step: 'report_type', lang, data: {} });
      } else if (text === '2') {
        const alerts = await this.backend.getActiveAlerts();
        if (!alerts.length) {
          await this.sendText(from, tr.alertsNone);
        } else {
          const list = alerts.slice(0, 5).map((a: any) =>
            `• ${levelPrefix(a.alertLevel)}\n  *${a.title}*\n  📍 ${a.zone?.name || 'Matam'} — ${a.status}`).join('\n\n');
          await this.sendText(from, `${tr.alertsHeader(alerts.length)}\n\n${list}`);
        }
        this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
      } else if (text === '3') {
        await this.sendText(from, tr.profile(from));
        this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
      } else {
        await this.sendText(from, tr.invalidOption);
      }
      return;
    }

    if (session.step === 'report_type') {
      const idx = parseInt(raw.trim(), 10) - 1;
      const value = RISK_ORDER[idx];
      if (!value) {
        await this.sendText(from, tr.invalidNumber(RISK_ORDER.length));
        return;
      }
      session.data.type = value;
      session.data.typeLabel = RISK_LABELS[value][lang];
      await this.sendText(from, tr.describePrompt(session.data.typeLabel));
      this.conversations.set(from, { step: 'report_desc', lang, data: session.data });
      return;
    }

    if (session.step === 'report_desc') {
      session.data.description = raw;
      await this.sendText(from, tr.severityPrompt);
      this.conversations.set(from, { step: 'report_severity', lang, data: session.data });
      return;
    }

    if (session.step === 'report_severity') {
      const sev = ({ '1': 1, '2': 2, '3': 3 } as Record<string, number>)[raw.trim()];
      if (!sev) {
        await this.sendText(from, tr.invalidSeverity);
        return;
      }
      session.data.severity = sev;
      try {
        await this.backend.createSignalement({
          phone: from,
          type: session.data.type,
          description: session.data.description,
          severity: sev,
          language: lang,
          mediaUrls: session.data.mediaUrls,
        });
        await this.sendText(from, tr.reportSaved(session.data.typeLabel, tr.sevLabels[sev - 1]));
      } catch {
        await this.sendText(from, tr.reportError);
      }
      this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
    }
  }

  private async showMainMenu(from: string, lang: Lang) {
    await this.sendText(from, t(lang).menu);
    this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
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
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
        { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
    } catch (err: any) {
      const meta = err?.response?.data?.error;
      this.logger.error(
        `Envoi WhatsApp → ${to} échoué (HTTP ${err?.response?.status ?? '?'}) : ` +
        (meta ? `[${meta.code}] ${meta.message}` : err?.message ?? 'erreur inconnue'),
      );
    }
  }
}
