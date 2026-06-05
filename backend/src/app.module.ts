import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AlertsModule } from './alerts/alerts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ZonesModule } from './zones/zones.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SignalementsModule } from './signalements/signalements.module';
import { UssdModule } from './ussd/ussd.module';
import { IvrModule } from './ivr/ivr.module';
import { StatsModule } from './stats/stats.module';
import { MetricsModule } from './metrics/metrics.module';
import { SentryModule } from './common/sentry/sentry.module';
import { TrainingsModule } from './trainings/trainings.module';
import { MissionsModule } from './missions/missions.module';
import { UploadModule } from './common/upload/upload.module';
import { SchedulerModule } from './common/scheduler/scheduler.module';
import { FlagsModule } from './flags/flags.module';
import { validateEnv } from './common/config/env.validation';
import { configuration } from './common/config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
      load: [configuration],
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        redis: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    AlertsModule,
    NotificationsModule,
    ZonesModule,
    HealthModule,
    AuditModule,
    SignalementsModule,
    UssdModule,
    IvrModule,
    StatsModule,
    MetricsModule,
    SentryModule,
    TrainingsModule,
    MissionsModule,
    UploadModule,
    SchedulerModule,
    FlagsModule,
  ],
})
export class AppModule {}
