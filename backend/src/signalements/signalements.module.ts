import { Module } from '@nestjs/common';
import { SignalementsService } from './signalements.service';
import { SignalementsController } from './signalements.controller';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [SignalementsController],
  providers: [SignalementsService],
  exports: [SignalementsService],
})
export class SignalementsModule {}
