import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { SentryService } from './common/sentry/sentry.service';

/**
 * Configuration HTTP partagée par main.ts et les tests e2e : les tests
 * exercent exactement les mêmes pipes, préfixe, CORS et proxy qu'en production.
 */
export function configureApp(app: NestExpressApplication) {
  // Derrière Nginx (un saut) : req.ip = client réel, sinon la limitation de
  // débit compterait tous les utilisateurs comme une seule adresse (audit F10).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // Sécurité
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", process.env.WS_PUBLIC_ORIGIN || 'ws://localhost:4000'],
          imgSrc: ["'self'", 'data:', 'https://*.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
        },
      },
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''));
      const normalized = origin?.replace(/\/$/, '');
      // Les requêtes sans Origin (health checks Docker, curl, webhooks tiers,
      // server-to-server) ne sont pas des requêtes navigateur cross-origin :
      // CORS ne s'y applique pas et les bloquer n'apporte aucune sécurité
      // (un client non-navigateur peut forger n'importe quel Origin).
      if (!origin) return callback(null, true);
      if (allowed.includes(normalized)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} non autorisée`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtres & intercepteurs globaux (avec injection MetricsService)
  const metricsService = app.get(MetricsService);
  const sentryService = app.get(SentryService);
  app.useGlobalFilters(new HttpExceptionFilter(sentryService));
  app.useGlobalInterceptors(new LoggingInterceptor(metricsService));

}
