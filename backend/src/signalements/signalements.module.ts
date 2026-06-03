import { Module } from '@nestjs/common';
import { SignalementsService } from './signalements.service';
import { SignalementsController } from './signalements.controller';

@Module({
  controllers: [SignalementsController],
  providers: [SignalementsService],
  exports: [SignalementsService],
})
export class SignalementsModule {}
