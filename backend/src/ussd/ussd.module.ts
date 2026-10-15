import { Module } from '@nestjs/common';
import { UssdController } from './ussd.controller';
import { UssdService } from './ussd.service';
import { SignalementsModule } from '../signalements/signalements.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [SignalementsModule, AlertsModule],
  controllers: [UssdController],
  providers: [UssdService],
})
export class UssdModule {}
