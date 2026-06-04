import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MissionStatus, Role } from '@prisma/client';
import { CreateMissionDto } from './dto/mission.dto';

@Injectable()
export class MissionsService {
  constructor(private prisma: PrismaService) {}

  /** Liste des missions (filtrée par zone pour les sentinelles). */
  async findAll(user: { id: string; role: Role }, zoneId?: string) {
    const where: any = {};
    if (zoneId) where.zoneId = zoneId;
    return this.prisma.mission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        zone: { select: { name: true } },
        assignments: { include: { sentinel: { select: { id: true, name: true } } } },
      },
    });
  }

  /** Missions assignées à la sentinelle courante. */
  async myMissions(userId: string) {
    const assignments = await this.prisma.missionAssignment.findMany({
      where: { sentinelId: userId },
      orderBy: { assignedAt: 'desc' },
      include: { mission: { include: { zone: { select: { name: true } } } } },
    });
    return assignments.map((a) => ({
      assignmentId: a.id,
      status: a.status,
      report: a.report,
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
      ...a.mission,
    }));
  }

  create(dto: CreateMissionDto, userId: string) {
    return this.prisma.mission.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type || 'VERIFICATION',
        zoneId: dto.zoneId,
        alertId: dto.alertId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        createdById: userId,
      },
    });
  }

  async assign(missionId: string, sentinelId: string) {
    const mission = await this.prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission) throw new NotFoundException('Mission introuvable');

    const sentinel = await this.prisma.user.findUnique({ where: { id: sentinelId } });
    if (!sentinel) throw new NotFoundException('Sentinelle introuvable');

    await this.prisma.missionAssignment.upsert({
      where: { missionId_sentinelId: { missionId, sentinelId } },
      update: { status: MissionStatus.ASSIGNED },
      create: { missionId, sentinelId, status: MissionStatus.ASSIGNED },
    });
    return this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.ASSIGNED } });
  }

  /** La sentinelle accepte et démarre la mission. */
  async accept(missionId: string, userId: string) {
    const assignment = await this.getAssignment(missionId, userId);
    await this.prisma.missionAssignment.update({ where: { id: assignment.id }, data: { status: MissionStatus.IN_PROGRESS } });
    await this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.IN_PROGRESS } });
    await this.touchActivity(userId);
    return { success: true };
  }

  /** La sentinelle clôture la mission avec compte-rendu. */
  async complete(missionId: string, userId: string, report?: string) {
    const assignment = await this.getAssignment(missionId, userId);
    await this.prisma.missionAssignment.update({
      where: { id: assignment.id },
      data: { status: MissionStatus.DONE, report, completedAt: new Date() },
    });
    // Mission terminée si toutes les assignations sont DONE
    const remaining = await this.prisma.missionAssignment.count({
      where: { missionId, status: { not: MissionStatus.DONE } },
    });
    if (remaining === 0) {
      await this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.DONE } });
    }
    await this.touchActivity(userId);
    return { success: true };
  }

  private async getAssignment(missionId: string, sentinelId: string) {
    const assignment = await this.prisma.missionAssignment.findUnique({
      where: { missionId_sentinelId: { missionId, sentinelId } },
    });
    if (!assignment) throw new ForbiddenException('Cette mission ne vous est pas assignée');
    return assignment;
  }

  private async touchActivity(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }
}
