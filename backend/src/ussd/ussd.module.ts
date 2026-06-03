import { Module } from '@nestjs/common';
import { UssdController } from './ussd.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [UssdController],
})
export class UssdModule {}
