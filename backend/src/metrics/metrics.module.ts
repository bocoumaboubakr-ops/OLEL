import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { OperationalMetricsService } from './operational-metrics.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  controllers: [MetricsController],
  providers: [MetricsService, OperationalMetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
