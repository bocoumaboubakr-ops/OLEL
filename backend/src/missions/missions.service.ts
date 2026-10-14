import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccountStatus, MissionStatus, Prisma, Role } from '@prisma/client';
import { CreateMissionDto } from './dto/mission.dto';
import { AuditService } from '../audit/audit.service';
import { TerritoryService } from '../common/territory/territory.service';
import { TERRITORY_EXEMPT } from '../users/user-policy';

type Actor = { id: string; role: Role; zoneId?: string | null };

/** Rôles pouvant recevoir une mission de terrain. */
const ASSIGNABLE_ROLES: Role[] = [Role.SENTINELLE, Role.COORDINATEUR];

/**
 * Missions (audit F20) : liste cloisonnée par territoire, assignation
 * réservée à un agent de terrain HABILITÉ (statut ACTIVE) de son territoire,
 * statut de participation distinct du statut global de la mission.
 */
@Injectable()
export class MissionsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private territory: TerritoryService) {}

  private async territoryOf(actor: Actor): Promise<string[] | null> {
    if (TERRITORY_EXEMPT.includes(actor.role)) return null;
    return actor.zoneId ? this.territory.subtree(actor.zoneId) : [];
  }

  private async assertZoneInTerritory(zoneId: string | null | undefined, actor: Actor) {
    const t = await this.territoryOf(actor);
    if (t === null) return;
    if (!zoneId || !t.includes(zoneId)) throw new ForbiddenException('Zone hors de votre territoire');
  }

  /**
   * Opérateur : missions des zones de son territoire. Sentinelle : missions
   * qui lui sont assignées et missions ouvertes de son territoire.
   */
  async findAll(user: Actor, zoneId?: string) {
    const t = await this.territoryOf(user);
    const where: Prisma.MissionWhereInput = {};
    if (zoneId) where.zoneId = zoneId;
    if (t !== null) {
      where.AND = [user.role === Role.SENTINELLE
        ? { OR: [{ assignments: { some: { sentinelId: user.id } } }, { status: MissionStatus.OPEN, zoneId: { in: t } }] }
        : { zoneId: { in: t } }];
    }
    return this.prisma.mission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        zone: { select: { name: true } },
        assignments: { include: { sentinel: { select: { id: true, name: true } } } },
      },
    });
  }

  /** Missions assignées à l'agent : statut de SA participation et statut global, sans écrasement. */
  async myMissions(userId: string) {
    const assignments = await this.prisma.missionAssignment.findMany({
      where: { sentinelId: userId },
      orderBy: { assignedAt: 'desc' },
      include: { mission: { include: { zone: { select: { name: true } } } } },
    });
    return assignments.map((a) => ({
      ...a.mission,
      missionStatus: a.mission.status,
      assignmentId: a.id,
      status: a.status, // participation de l'agent (affichée sur le mobile)
      report: a.report,
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
    }));
  }

  async create(dto: CreateMissionDto, user: Actor) {
    await this.assertZoneInTerritory(dto.zoneId, user);
    if (dto.alertId) {
      const alert = await this.prisma.alert.findUnique({ where: { id: dto.alertId }, select: { zoneId: true } });
      if (!alert) throw new NotFoundException('Alerte introuvable');
      await this.assertZoneInTerritory(alert.zoneId, user);
    }
    const mission = await this.prisma.mission.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type || 'VERIFICATION',
        zoneId: dto.zoneId,
        alertId: dto.alertId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        createdById: user.id,
      },
    });
    this.audit.log({ userId: user.id, action: 'mission.create', resource: 'mission', resourceId: mission.id, details: { zoneId: dto.zoneId } });
    return mission;
  }

  async assign(missionId: string, sentinelId: string, user: Actor) {
    const mission = await this.prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission) throw new NotFoundException('Mission introuvable');
    await this.assertZoneInTerritory(mission.zoneId, user);
    if (mission.status === MissionStatus.DONE || mission.status === MissionStatus.CANCELLED) {
      throw new ConflictException('Mission terminée ou annulée');
    }

    const sentinel = await this.prisma.user.findUnique({ where: { id: sentinelId } });
    if (!sentinel || sentinel.deletedAt) throw new NotFoundException('Agent introuvable');
    if (!ASSIGNABLE_ROLES.includes(sentinel.role)) throw new BadRequestException('Seule une sentinelle ou un coordinateur peut recevoir une mission');
    if (sentinel.status !== AccountStatus.ACTIVE) throw new BadRequestException('Agent non habilité (en formation ou suspendu)');
    // L'agent doit couvrir la zone de la mission (sa zone, une zone parente ou fille)
    if (mission.zoneId && sentinel.zoneId) {
      const related = (await this.territory.isWithin(mission.zoneId, sentinel.zoneId)) || (await this.territory.isWithin(sentinel.zoneId, mission.zoneId));
      if (!related) throw new BadRequestException('L\'agent ne couvre pas la zone de la mission');
    }
    await this.assertZoneInTerritory(sentinel.zoneId, user);

    await this.prisma.missionAssignment.upsert({
      where: { missionId_sentinelId: { missionId, sentinelId } },
      update: { status: MissionStatus.ASSIGNED },
      create: { missionId, sentinelId, status: MissionStatus.ASSIGNED },
    });
    const updated = mission.status === MissionStatus.OPEN
      ? await this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.ASSIGNED } })
      : mission;
    this.audit.log({ userId: user.id, action: 'mission.assign', resource: 'mission', resourceId: missionId, details: { sentinelId } });
    return updated;
  }

  /** L'agent accepte et démarre la mission (depuis ASSIGNED uniquement). */
  async accept(missionId: string, userId: string) {
    const assignment = await this.getAssignment(missionId, userId);
    if (assignment.status !== MissionStatus.ASSIGNED) throw new ConflictException(`Participation ${assignment.status} : acceptation impossible`);
    await this.prisma.$transaction([
      this.prisma.missionAssignment.update({ where: { id: assignment.id }, data: { status: MissionStatus.IN_PROGRESS } }),
      this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.IN_PROGRESS } }),
    ]);
    await this.touchActivity(userId);
    return { success: true };
  }

  /** L'agent clôture SA participation avec compte-rendu ; la mission est terminée quand toutes le sont. */
  async complete(missionId: string, userId: string, report?: string) {
    const assignment = await this.getAssignment(missionId, userId);
    if (assignment.status !== MissionStatus.IN_PROGRESS && assignment.status !== MissionStatus.ASSIGNED) {
      throw new ConflictException(`Participation ${assignment.status} : clôture impossible`);
    }
    await this.prisma.missionAssignment.update({
      where: { id: assignment.id },
      data: { status: MissionStatus.DONE, report, completedAt: new Date() },
    });
    const remaining = await this.prisma.missionAssignment.count({
      where: { missionId, status: { in: [MissionStatus.ASSIGNED, MissionStatus.IN_PROGRESS] } },
    });
    if (remaining === 0) {
      await this.prisma.mission.update({ where: { id: missionId }, data: { status: MissionStatus.DONE } });
    }
    await this.touchActivity(userId);
    return { success: true };
  }

  /** L'agent refuse une mission assignée. */
  async reject(missionId: string, userId: string) {
    const assignment = await this.getAssignment(missionId, userId);
    if (assignment.status === MissionStatus.DONE) throw new ConflictException('Participation déjà terminée');
    await this.prisma.missionAssignment.update({
      where: { id: assignment.id },
      data: { status: MissionStatus.CANCELLED },
    });
    const active = await this.prisma.missionAssignment.count({
      where: { missionId, status: { in: [MissionStatus.ASSIGNED, MissionStatus.IN_PROGRESS] } },
    });
    if (active === 0) {
      const done = await this.prisma.missionAssignment.count({ where: { missionId, status: MissionStatus.DONE } });
      await this.prisma.mission.update({ where: { id: missionId }, data: { status: done ? MissionStatus.DONE : MissionStatus.OPEN } });
    }
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
