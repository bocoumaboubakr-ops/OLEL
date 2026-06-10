import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BotModule } from './bot.module';

async function bootstrap() {
  // rawBody requis pour vérifier la signature HMAC des webhooks Meta
  const app = await NestFactory.create<NestExpressApplication>(BotModule, { rawBody: true });
  const port = process.env.BOT_PORT || 3002;
  await app.listen(port, '0.0.0.0');
  console.log(`OLEL Bot démarré sur port ${port}`);
}

bootstrap();
