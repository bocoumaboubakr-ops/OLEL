import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsProcessor } from './notifications.processor';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { IvrService } from './channels/ivr.service';
import { UssdService } from './channels/ussd.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FlagsModule } from '../flags/flags.module';
import { BroadcastDispatcher } from './broadcast-dispatcher.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' }), PrismaModule, FlagsModule],
  providers: [NotificationsProcessor, BroadcastDispatcher, WhatsappService, SmsService, IvrService, UssdService],
  exports: [BroadcastDispatcher, WhatsappService, SmsService, IvrService, UssdService],
})
export class NotificationsModule {}
