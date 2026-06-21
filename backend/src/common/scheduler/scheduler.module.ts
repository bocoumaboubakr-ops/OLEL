import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsScheduler } from './alerts.scheduler';
import { SentinellesScheduler } from './sentinelles.scheduler';
import { AlertsModule } from '../../alerts/alerts.module';

@Module({
  imports: [ScheduleModule.forRoot(), AlertsModule],
  providers: [AlertsScheduler, SentinellesScheduler],
})
export class SchedulerModule {}
