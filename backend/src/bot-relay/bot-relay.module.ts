import { Module } from '@nestjs/common';
import { BotRelayController, SmsDeliveryReportController } from './bot-relay.controller';
import { BotRelayService } from './bot-relay.service';

@Module({
  controllers: [BotRelayController, SmsDeliveryReportController],
  providers: [BotRelayService],
  exports: [BotRelayService],
})
export class BotRelayModule {}
