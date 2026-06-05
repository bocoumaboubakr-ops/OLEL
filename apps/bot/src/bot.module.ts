import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './whatsapp/whatsapp.controller';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { BackendService } from './services/backend.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [WhatsappController],
  providers: [WhatsappService, BackendService],
})
export class BotModule {}
