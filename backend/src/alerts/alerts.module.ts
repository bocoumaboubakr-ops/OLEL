import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' }), AuditModule],
  providers: [AlertsService, AlertsGateway],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
