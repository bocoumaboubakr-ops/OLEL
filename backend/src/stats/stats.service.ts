import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertStatus, AlertType, SignalementStatus } from '@prisma/client';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      alertsTotal,
      alertsActive,
      alertsLast30Days,
      signalementsPending,
      usersTotal,
      alertsByTypeRaw,
      alertsBySeverityRaw,
    ] = await Promise.all([
      this.prisma.alert.count(),
      this.prisma.alert.count({ where: { status: AlertStatus.ACTIVE } }),
      this.prisma.alert.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.signalement.count({ where: { status: SignalementStatus.PENDING } }),
      this.prisma.user.count(),
      this.prisma.alert.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } }),
    ]);

    const alertsByType: Record<string, number> = {};
    for (const row of alertsByTypeRaw) {
      alertsByType[row.type] = row._count._all;
    }
    // Fill missing alert types with 0
    for (const t of Object.values(AlertType)) {
      if (!(t in alertsByType)) alertsByType[t] = 0;
    }

    const alertsBySeverity: Record<string, number> = {};
    for (const row of alertsBySeverityRaw) {
      alertsBySeverity[String(row.severity)] = row._count._all;
    }

    // notificationsSent — approximation via alerts * average channels if no dedicated table
    const notificationsSent = alertsTotal * 3;

    return {
      alertsTotal,
      alertsActive,
      alertsLast30Days,
      signalementsPending,
      usersTotal,
      notificationsSent,
      alertsByType,
      alertsBySeverity,
    };
  }
}
