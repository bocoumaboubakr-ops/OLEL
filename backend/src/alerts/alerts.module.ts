import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsBotController } from './alerts-bot.controller';
import { AlertsGateway } from './alerts.gateway';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlagsModule } from '../flags/flags.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' }), AuditModule, AuthModule, NotificationsModule, FlagsModule],
  providers: [AlertsService, AlertsGateway],
  controllers: [AlertsController, AlertsBotController],
  exports: [AlertsService],
})
export class AlertsModule {}
