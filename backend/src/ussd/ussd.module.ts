import { Module } from '@nestjs/common';
import { UssdController } from './ussd.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [NotificationsModule, PrismaModule],
  controllers: [UssdController],
})
export class UssdModule {}
