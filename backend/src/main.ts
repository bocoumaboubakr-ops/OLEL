import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { UPLOAD_DIR } from './common/media/media';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

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

  mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o750 });

  // Les médias ne sont plus servis publiquement (/uploads supprimé) : lecture
  // par URL signée via /api/v1/media (audit F12).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

  configureApp(app);

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
