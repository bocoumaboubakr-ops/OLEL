import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const INACTIVE_DAYS = parseInt(process.env.SENTINEL_INACTIVE_DAYS || '30', 10);

@Injectable()
export class SentinellesScheduler {
  private readonly logger = new Logger(SentinellesScheduler.name);

  constructor(private prisma: PrismaService) {}

  /** Désactive les sentinelles sans activité depuis INACTIVE_DAYS jours. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deactivateInactiveSentinelles() {
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
    // Exclure les sentinelles ayant une mission IN_PROGRESS
    const busySentinelIds = await this.prisma.missionAssignment.findMany({
      where: { status: 'IN_PROGRESS' },
      select: { sentinelId: true },
    }).then((rows) => rows.map((r) => r.sentinelId));

    const { count } = await this.prisma.user.updateMany({
      where: {
        role: Role.SENTINELLE,
        isActive: true,
        lastActiveAt: { lt: cutoff },
        ...(busySentinelIds.length > 0 ? { id: { notIn: busySentinelIds } } : {}),
      },
      data: { isActive: false },
    });
    if (count > 0) this.logger.log(`${count} sentinelle(s) désactivée(s) après ${INACTIVE_DAYS}j d'inactivité`);
    if (busySentinelIds.length > 0) this.logger.log(`${busySentinelIds.length} sentinelle(s) épargnée(s) — mission en cours`);
  }

  /** Rappel quotidien : liste des sentinelles inactives (pour monitoring). */
  @Cron('0 8 * * 1') // tous les lundis à 8h
  async logInactiveSentinelles() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await this.prisma.user.count({
      where: { role: Role.SENTINELLE, isActive: true, lastActiveAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.warn(`${count} sentinelle(s) active(s) sans activité depuis 7 jours`);
  }
}
