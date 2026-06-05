import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as compression from 'compression';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { SentryService } from './common/sentry/sentry.service';

// Capture fatal unhandled errors before NestJS is fully up
process.on('unhandledRejection', (reason) => {
  console.error('[Bootstrap] Unhandled rejection:', reason);
});

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context }) =>
            `${timestamp} [${context || 'App'}] ${level}: ${message}`,
          ),
        ),
      }),
      ...(process.env.NODE_ENV === 'production'
        ? [new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
           new winston.transports.File({ filename: 'logs/combined.log' })]
        : []),
    ],
  });

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

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
      // En production, les requêtes sans Origin (curl, webhooks tiers) sont refusées
      const isProd = process.env.NODE_ENV === 'production';
      if (!origin && !isProd) return callback(null, true);
      if (origin && allowed.includes(normalized)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin || '(aucune)'} non autorisée`));
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

  // Swagger : désactivé strictement en production
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('OLEL API')
      .setDescription('Plateforme d\'alerte précoce multi-risques — Région de Matam\n\nTous les types de risques : Inondation, Sécheresse, Incendie, Tempête, Épidémie, Criquets, Accident industriel, Mouvement de terrain.')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-bot-api-key', in: 'header' }, 'bot-api-key')
      .build();
    SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`OLEL Backend démarré → http://localhost:${port}/api/v1 | Docs: http://localhost:${port}/api-docs`, 'Bootstrap');
}

bootstrap();
