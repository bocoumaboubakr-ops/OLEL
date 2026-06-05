import { Module } from '@nestjs/common';
import { IvrController } from './ivr.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [IvrController],
})
export class IvrModule {}
