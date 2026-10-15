import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

let Sentry: typeof import('@sentry/node') | null = null;

@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private initialized = false;

  async onModuleInit() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      this.logger.log('SENTRY_DSN absent — Sentry désactivé');
      return;
    }
    try {
      Sentry = await import('@sentry/node');
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.APP_VERSION || 'olel@1.0.0',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        integrations: [Sentry.httpIntegration()],
      });
      this.initialized = true;
      this.logger.log('Sentry initialisé');
    } catch {
      this.logger.warn('Sentry non disponible (paquet absent) — désactivé');
    }
  }

  captureException(error: unknown, context?: Record<string, unknown>) {
    if (!this.initialized || !Sentry) return;
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(error);
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!this.initialized || !Sentry) return;
    Sentry.captureMessage(message, level);
  }

  setUser(id: string, phone?: string, role?: string) {
    if (!this.initialized || !Sentry) return;
    Sentry.setUser({ id, username: phone, extra: { role } });
  }

  clearUser() {
    if (!this.initialized || !Sentry) return;
    Sentry.setUser(null);
  }
}
