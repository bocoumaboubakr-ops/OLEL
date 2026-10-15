import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/** Délai maximal d'un appel au backend (audit F26). */
const BACKEND_TIMEOUT_MS = 10_000;

export interface InboundRecord { id: string; from: string; type: string; payload: Record<string, unknown> }

/**
 * Client du backend OLEL (clé API du bot). Les erreurs du relais durable
 * sont PROPAGÉES : le contrôleur répond alors une erreur à Meta, qui
 * re-livrera le message — rien n'est acquitté sans avoir été enregistré.
 */
@Injectable()
export class BackendService {
  private readonly logger = new Logger(BackendService.name);
  private readonly http: AxiosInstance;

  constructor(cfg: ConfigService) {
    this.http = axios.create({
      baseURL: `${cfg.get('BACKEND_URL', 'http://localhost:4000')}/api/v1`,
      timeout: BACKEND_TIMEOUT_MS,
      headers: { 'x-bot-api-key': cfg.get('BOT_API_KEY', '') },
    });
  }

  // ── Relais durable (audit F25) ───────────────────────────────────────────
  async recordInbound(m: InboundRecord): Promise<{ duplicate: boolean }> {
    const { data } = await this.http.post('/bot-relay/inbound', m);
    return data;
  }

  async markInbound(id: string, status: 'PROCESSED' | 'FAILED' | 'IGNORED', error?: string) {
    await this.http.patch(`/bot-relay/inbound/${encodeURIComponent(id)}`, { status, error });
  }

  async pendingInbound(): Promise<(InboundRecord & { payload: any })[]> {
    const { data } = await this.http.get('/bot-relay/inbound/pending');
    return Array.isArray(data) ? data : [];
  }

  async getSession<T>(phone: string): Promise<T | null> {
    const { data } = await this.http.get(`/bot-relay/sessions/${encodeURIComponent(phone)}`);
    return (data?.state as T) ?? null;
  }

  async saveSession(phone: string, state: unknown) {
    await this.http.put(`/bot-relay/sessions/${encodeURIComponent(phone)}`, { state });
  }

  async getConsent(phone: string): Promise<{ known: boolean; optedOut: boolean; whatsappOptIn: boolean; hasCommune?: boolean }> {
    const { data } = await this.http.get('/bot-relay/consent', { params: { phone } });
    return data;
  }

  async setConsent(phone: string, choice: 'WHATSAPP_OPT_IN' | 'OPT_OUT' | 'OPT_IN_AGAIN', language?: string) {
    await this.http.post('/bot-relay/consent', { phone: phone.startsWith('+') ? phone : `+${phone}`, choice, language });
  }

  async listCommunes(): Promise<{ id: string; name: string }[]> {
    const { data } = await this.http.get('/bot-relay/communes');
    return Array.isArray(data) ? data : [];
  }

  async setCitizenZone(phone: string, zoneId: string): Promise<{ ok: boolean }> {
    const { data } = await this.http.post('/bot-relay/citizen-zone', { phone: phone.startsWith('+') ? phone : `+${phone}`, zoneId });
    return data;
  }

  async forwardStatuses(statuses: { providerMessageId: string; status: string; timestamp?: string; error?: string }[]) {
    if (statuses.length) await this.http.post('/bot-relay/whatsapp-statuses', { statuses });
  }

  // ── Consultation et signalements ─────────────────────────────────────────
  /** Alertes en vigueur pour la zone du citoyen ; null = consultation impossible (≠ aucune alerte, F16). */
  async getActiveAlerts(phone?: string): Promise<any[] | null> {
    try {
      const { data } = await this.http.get('/alerts-bot/active', { params: phone ? { phone } : {} });
      return Array.isArray(data) ? data : null;
    } catch (e) {
      this.logger.error(`Consultation des alertes indisponible : ${(e as Error).message}`);
      return null;
    }
  }

  async createSignalement(payload: {
    phone: string; type: string; description: string; severity?: number; language?: string;
    mediaUrls?: string[]; subtype?: string; latitude?: number; longitude?: number; messageId?: string;
  }) {
    const { data } = await this.http.post('/signalements/bot', payload);
    return data as { id: string; duplicate?: boolean };
  }

  /** Réuploade un média WhatsApp ; retourne la référence canonique, ou null en cas d'échec. */
  async uploadMedia(buffer: Buffer, filename: string, mimetype: string): Promise<string | null> {
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);
      const { data } = await this.http.post('/upload/bot-media', form, { maxBodyLength: 20 * 1024 * 1024, timeout: 30_000 });
      return data?.url || null;
    } catch (e) {
      this.logger.error(`Erreur uploadMedia: ${(e as Error).message}`);
      return null;
    }
  }
}
