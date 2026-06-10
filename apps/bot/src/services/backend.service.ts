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
      const { data } = await axios.get(`${this.backendUrl}/api/v1/alerts?status=ACTIVE&limit=5`, { headers: this.headers });
      return data.alerts || [];
    } catch (e) {
      this.logger.error(`Erreur getActiveAlerts: ${e.message}`);
      return [];
    }
  }

  async createSignalement(payload: { phone: string; type: string; description: string; severity?: number }) {
    const { data } = await axios.post(
      `${this.backendUrl}/api/v1/signalements/bot`,
      payload,
      { headers: this.headers },
    );
    return data;
  }
}
