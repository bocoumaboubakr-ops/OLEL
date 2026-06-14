import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BackendService {
  private readonly logger = new Logger(BackendService.name);
  private readonly backendUrl: string;
  private readonly apiKey: string;

  constructor(private cfg: ConfigService) {
    this.backendUrl = cfg.get('BACKEND_URL', 'http://localhost:4000');
    this.apiKey = cfg.get('BOT_API_KEY', '');
  }

  private get headers() {
    return { 'x-bot-api-key': this.apiKey };
  }

  async getActiveAlerts() {
    try {
      const { data } = await axios.get(`${this.backendUrl}/api/v1/alerts-bot/active`, { headers: this.headers });
      return Array.isArray(data) ? data : [];
    } catch (e) {
      this.logger.error(`Erreur getActiveAlerts: ${e.message}`);
      return [];
    }
  }

  async createSignalement(payload: { phone: string; type: string; description: string; severity?: number; language?: string; mediaUrls?: string[] }) {
    const { data } = await axios.post(
      `${this.backendUrl}/api/v1/signalements/bot`,
      payload,
      { headers: this.headers },
    );
    return data;
  }

  /**
   * Réuploade vers le backend un média (audio/photo) téléchargé depuis WhatsApp.
   * Retourne l'URL publique stockée, ou null en cas d'échec.
   */
  async uploadMedia(buffer: Buffer, filename: string, mimetype: string): Promise<string | null> {
    try {
      const form = new FormData();
      // Node 18+ : Blob/FormData globaux, supportés par axios
      form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);
      const { data } = await axios.post(
        `${this.backendUrl}/api/v1/upload/bot-media`,
        form,
        { headers: this.headers, maxBodyLength: Infinity, maxContentLength: Infinity },
      );
      return data?.url || null;
    } catch (e) {
      this.logger.error(`Erreur uploadMedia: ${(e as Error).message}`);
      return null;
    }
  }
}
