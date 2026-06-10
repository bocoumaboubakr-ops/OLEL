import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsScheduler } from './alerts.scheduler';
import { SentinellesScheduler } from './sentinelles.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AlertsScheduler, SentinellesScheduler],
})
export class SchedulerModule {}
