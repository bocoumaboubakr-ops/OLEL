import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertType, DeliveryStatus, SignalementStatus } from '@prisma/client';
import { PUBLIC_ACTIVE_STATUSES } from '../alerts/alert-policy';

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
      notificationsSent,
    ] = await Promise.all([
      this.prisma.alert.count(),
      this.prisma.alert.count({ where: { status: { in: PUBLIC_ACTIVE_STATUSES } } }),
      this.prisma.alert.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.signalement.count({ where: { status: SignalementStatus.PENDING } }),
      this.prisma.user.count(),
      this.prisma.alert.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } }),
      // Messages acceptés par un fournisseur (≠ livrés, ≠ simulés) — audit F22
      this.prisma.broadcastDelivery.count({ where: { status: { in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.READ] } } }),
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
