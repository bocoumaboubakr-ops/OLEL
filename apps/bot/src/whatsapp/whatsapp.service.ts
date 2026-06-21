import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackendService } from '../services/backend.service';
import axios from 'axios';
import { Lang, t, DICT } from './i18n';
import { THEMES, getTheme, themeMenu, optionsMenu, type Theme, type RiskOption } from './themes';

// Préfixe de diffusion selon le niveau d'alerte officiel (lecture des alertes)
const LEVEL_PREFIX: Record<string, string> = {
  BLEU: 'ℹ️ INFORMATION', JAUNE: '⚠️ VIGILANCE', ORANGE: '🔶 PRÉ-ALERTE',
  ROUGE: '🚨 URGENCE', ROUGE_FONCE: '🔴 CRISE MAJEURE',
};
export function levelPrefix(level?: string): string {
  return LEVEL_PREFIX[level || 'BLEU'] || LEVEL_PREFIX.BLEU;
}

interface ReportData {
  theme?: Theme;
  option?: RiskOption;
  description?: string;
  mediaUrls?: string[];
}

interface Session {
  step: string;
  lang?: Lang;
  data: ReportData;
}

const SKIP_WORDS = ['passer', 'skip', 'non', 'no', 'pas', 'sauter', '0'];

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

    this.logger.log(`Message de ${from}: "${raw}" (step: ${session.step}, lang: ${session.lang || '-'})`);

    // ── Commandes globales (avant tout traitement) ─────────────────────────
    if (text === 'langue' || text === 'lang' || text === 'ɗemngal' || text === 'làkk') {
      await this.sendText(from, DICT.fr.chooseLang);
      this.conversations.set(from, { step: 'awaiting_lang', data: {} });
      return;
    }

    // ── Choix de langue (1er contact OU avant qu'une langue ne soit fixée) ──
    if (!session.lang) {
      if (session.step !== 'awaiting_lang') {
        await this.sendText(from, DICT.fr.chooseLang);
        this.conversations.set(from, { step: 'awaiting_lang', data: {} });
        return;
      }
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

    const lang: Lang = session.lang;
    const tr = t(lang);

    // ── Image reçue (photo de signalement) ────────────────────────────────
    if (msg.type === 'image' || msg.image) {
      await this.handleImage(from, msg.image?.id, lang, session);
      return;
    }

    // ── Message vocal reçu ────────────────────────────────────────────────
    if (msg.type === 'audio' || msg.audio) {
      await this.handleAudio(from, msg.audio?.id, lang, session);
      return;
    }

    if (text === 'menu' || text === '0' || text === 'stop' || text === 'aide') {
      await this.showMainMenu(from, lang);
      return;
    }

    if (session.step === 'awaiting_choice') {
      if (text === '1') {
        await this.sendText(from, `${tr.reportThemePrompt}\n\n${themeMenu(lang)}`);
        this.conversations.set(from, { step: 'report_theme', lang, data: {} });
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

    // ── Étape 1/4 : choix de la thématique (6 options) ────────────────────
    if (session.step === 'report_theme') {
      const idx = parseInt(raw.trim(), 10) - 1;
      const theme = getTheme(idx);
      if (!theme) {
        await this.sendText(from, tr.invalidNumber(THEMES.length));
        return;
      }
      session.data.theme = theme;
      const themeLabel = theme.labels[lang];
      await this.sendText(from, `${tr.reportOptionPrompt(themeLabel)}\n\n${optionsMenu(theme, lang)}`);
      this.conversations.set(from, { step: 'report_option', lang, data: session.data });
      return;
    }

    // ── Étape 2/4 : choix du type précis dans la thématique ───────────────
    if (session.step === 'report_option') {
      const theme = session.data.theme;
      if (!theme) {
        await this.showMainMenu(from, lang);
        return;
      }
      const idx = parseInt(raw.trim(), 10) - 1;
      const option = theme.options[idx];
      if (!option) {
        await this.sendText(from, tr.invalidNumber(theme.options.length));
        return;
      }
      session.data.option = option;
      const label = `${option.icon} ${option.labels[lang]}`;
      await this.sendText(from, tr.describePrompt(label));
      this.conversations.set(from, { step: 'report_desc', lang, data: session.data });
      return;
    }

    // ── Étape 3/4 : description textuelle ─────────────────────────────────
    if (session.step === 'report_desc') {
      session.data.description = raw;
      await this.sendText(from, tr.photoPrompt);
      this.conversations.set(from, { step: 'report_photo', lang, data: session.data });
      return;
    }

    // ── Étape 4/4-bis : photo optionnelle (l'image arrive via handleImage) ──
    if (session.step === 'report_photo') {
      // Le citoyen tape "passer" / "skip" / etc. pour sauter la photo
      if (SKIP_WORDS.includes(text)) {
        await this.sendText(from, tr.photoSkipped);
        await this.sendText(from, tr.severityPrompt);
        this.conversations.set(from, { step: 'report_severity', lang, data: session.data });
        return;
      }
      // Tout autre texte : on rappelle l'option (envoyer photo, ou *passer*)
      await this.sendText(from, tr.photoPrompt);
      return;
    }

    // ── Étape finale : gravité 1/2/3 ──────────────────────────────────────
    if (session.step === 'report_severity') {
      const sev = ({ '1': 1, '2': 2, '3': 3 } as Record<string, number>)[raw.trim()];
      if (!sev) {
        await this.sendText(from, tr.invalidSeverity);
        return;
      }
      await this.finalizeReport(from, lang, session.data, sev);
    }
  }

  /** Crée le signalement avec la description préfixée selon l'option choisie. */
  private async finalizeReport(from: string, lang: Lang, data: ReportData, sev: number) {
    const tr = t(lang);
    const option = data.option;
    if (!option) {
      await this.sendText(from, tr.reportError);
      this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
      return;
    }
    const description = (option.descPrefix || '') + (data.description || '');
    const label = `${option.icon} ${option.labels[lang]}`;
    try {
      await this.backend.createSignalement({
        phone: from,
        type: option.type,
        description,
        severity: sev,
        language: lang,
        mediaUrls: data.mediaUrls,
      });
      await this.sendText(from, tr.reportSaved(label, tr.sevLabels[sev - 1]));
    } catch (e: any) {
      this.logger.error(
        `createSignalement échoué pour ${from} : HTTP ${e?.response?.status} — ` +
        `${JSON.stringify(e?.response?.data || e?.message)} | payload type=${option.type} sev=${sev} lang=${lang}`,
      );
      await this.sendText(from, tr.reportError);
    }
    this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
  }

  /** Télécharge un média WhatsApp (audio/image) et le réuploade vers le backend. */
  private async downloadWhatsappMedia(mediaId: string, expectedKind: 'audio' | 'image'): Promise<{ url: string } | null> {
    const token = this.cfg.get('WHATSAPP_TOKEN', '');
    if (!token || !mediaId) return null;
    try {
      const meta = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mimetype = String(meta.data?.mime_type || (expectedKind === 'audio' ? 'audio/ogg' : 'image/jpeg')).split(';')[0].trim();
      const bin = await axios.get(meta.data.url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      });
      const buffer = Buffer.from(bin.data);
      let ext = '';
      if (expectedKind === 'audio') {
        ext = mimetype.includes('mpeg') ? '.mp3' : mimetype.includes('mp4') ? '.m4a' : '.ogg';
      } else {
        ext = mimetype.includes('png') ? '.png' : mimetype.includes('webp') ? '.webp' : '.jpg';
      }
      const filenamePrefix = expectedKind === 'audio' ? 'voice' : 'photo';
      const url = await this.backend.uploadMedia(buffer, `${filenamePrefix}-${Date.now()}${ext}`, mimetype);
      return url ? { url } : null;
    } catch (e) {
      this.logger.error(`downloadWhatsappMedia (${expectedKind}) échoué : ${(e as Error).message}`);
      return null;
    }
  }

  private async handleImage(from: string, mediaId: string | undefined, lang: Lang, session: Session) {
    const tr = t(lang);
    if (!mediaId) { await this.sendText(from, tr.reportError); return; }

    const media = await this.downloadWhatsappMedia(mediaId, 'image');
    if (!media) { await this.sendText(from, tr.reportError); return; }

    // Si on est à l'étape photo : on attache et on passe à la gravité
    if (session.step === 'report_photo') {
      session.data.mediaUrls = [...(session.data.mediaUrls || []), media.url];
      this.conversations.set(from, { ...session, lang });
      await this.sendText(from, tr.severityPrompt);
      this.conversations.set(from, { step: 'report_severity', lang, data: session.data });
      return;
    }

    // Si on est dans le flow (description en cours) : on attache silencieusement
    if (['report_theme', 'report_option', 'report_desc'].includes(session.step)) {
      session.data.mediaUrls = [...(session.data.mediaUrls || []), media.url];
      this.conversations.set(from, { ...session, lang });
      return;
    }

    // Photo envoyée hors flow → signalement direct
    try {
      await this.backend.createSignalement({
        phone: from,
        type: 'AUTRE',
        description: '📷 Photo envoyée hors signalement — à qualifier par un agent',
        severity: 2,
        language: lang,
        mediaUrls: [media.url],
      });
      await this.sendText(from, tr.audioReceived);
    } catch {
      await this.sendText(from, tr.reportError);
    }
    this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
  }

  private async handleAudio(from: string, mediaId: string | undefined, lang: Lang, session: Session) {
    const tr = t(lang);
    if (!mediaId) { await this.sendText(from, tr.reportError); return; }

    const media = await this.downloadWhatsappMedia(mediaId, 'audio');
    if (!media) { await this.sendText(from, tr.reportError); return; }

    const inReportFlow = ['report_theme', 'report_option', 'report_desc', 'report_photo', 'report_severity'].includes(session.step);

    if (inReportFlow) {
      session.data.mediaUrls = [...(session.data.mediaUrls || []), media.url];
      this.conversations.set(from, { ...session, lang });
      await this.sendText(from, tr.audioPrompt);
      return;
    }

    // Vocal envoyé hors flow → signalement vocal direct
    try {
      await this.backend.createSignalement({
        phone: from,
        type: 'AUTRE',
        description: '🎙️ Signalement vocal — à écouter par un agent',
        severity: 2,
        language: lang,
        mediaUrls: [media.url],
      });
      await this.sendText(from, tr.audioReceived);
    } catch {
      await this.sendText(from, tr.reportError);
    }
    this.conversations.set(from, { step: 'awaiting_choice', lang, data: {} });
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
