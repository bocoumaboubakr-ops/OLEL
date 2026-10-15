import { Module } from '@nestjs/common';
import { IvrController } from './ivr.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlagsModule } from '../flags/flags.module';
import { SignalementsModule } from '../signalements/signalements.module';

@Module({
  imports: [NotificationsModule, FlagsModule, SignalementsModule],
  controllers: [IvrController],
})
export class IvrModule {}
