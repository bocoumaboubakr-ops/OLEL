import { NestFactory } from '@nestjs/core';
import { BotModule } from './bot.module';

async function bootstrap() {
  const app = await NestFactory.create(BotModule);
  const port = process.env.BOT_PORT || 3002;
  await app.listen(port);
  console.log(`OLEL Bot démarré sur port ${port}`);
}

bootstrap();
