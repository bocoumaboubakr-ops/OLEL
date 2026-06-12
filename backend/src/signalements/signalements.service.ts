import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { AlertLevel, Role, SignalementStatus } from '@prisma/client';

const TYPE_LABEL: Record<string, string> = {
  INONDATION: 'Inondation', SECHERESSE: 'Sécheresse', INCENDIE: 'Incendie',
  TEMPETE: 'Tempête', EPIDEMIE: 'Épidémie', LOCUSTES: 'Criquets',
  ACCIDENT_INDUSTRIEL: 'Accident industriel', MOUVEMENT_DE_TERRAIN: 'Mouvement de terrain',
  AUTRE: 'Danger signalé',
};

// Gravité citoyenne (1-3) → niveau d'alerte officiel d'entrée
const SEVERITY_TO_LEVEL: Record<number, AlertLevel> = {
  1: AlertLevel.JAUNE,
  2: AlertLevel.ORANGE,
  3: AlertLevel.ROUGE,
};

// Rôles qui voient les signalements sans restriction territoriale
const GLOBAL_ROLES: Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.PREFECTURE,
  Role.GOUVERNORAT,
  Role.PROTECTION_CIVILE,
  Role.SUPERVISEUR_REGIONAL,
];

@Injectable()
export class SignalementsService {
  private readonly logger = new Logger(SignalementsService.name);

  constructor(private prisma: PrismaService, private alerts: AlertsService) {}

  /**
   * Zones visibles par un opérateur local : sa zone, tous ses ascendants
   * (zone racine Matam) et tous ses descendants. Permet à une MAIRIE
   * d'Ourossogui de voir un signalement créé via le bot WhatsApp dont le
   * citoyen est rattaché à la zone racine (commune inconnue).
   */
  private async visibleZoneIds(zoneId: string): Promise<string[]> {
    const ids = new Set<string>([zoneId]);
    let cur = await this.prisma.zone.findUnique({
      where: { id: zoneId }, select: { id: true, parentId: true },
    });
    while (cur?.parentId) {
      ids.add(cur.parentId);
      cur = await this.prisma.zone.findUnique({
        where: { id: cur.parentId }, select: { id: true, parentId: true },
      });
    }
    const children = await this.prisma.zone.findMany({
      where: { parentId: { in: Array.from(ids) } }, select: { id: true },
    });
    children.forEach((z) => ids.add(z.id));
    return Array.from(ids);
  }

  async findAll(
    params: { page?: number; limit?: number; status?: SignalementStatus; zoneId?: string },
    caller?: { role: Role; zoneId?: string | null },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;

    if (caller && !GLOBAL_ROLES.includes(caller.role) && caller.zoneId) {
      const visible = await this.visibleZoneIds(caller.zoneId);
      where.user = { zoneId: { in: visible } };
    } else if (params.zoneId) {
      where.user = { zoneId: params.zoneId };
    }

    const [items, total] = await Promise.all([
      this.prisma.signalement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true, name: true, phone: true, zoneId: true,
              zone: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.signalement.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create(dto: { type: any; text: string; latitude?: number; longitude?: number; alertId?: string; mediaUrls?: string[]; channel?: string }, userId: string) {
    return this.prisma.signalement.create({
      data: {
        userId,
        type: dto.type,
        text: dto.text,
        mediaUrls: dto.mediaUrls || [],
        latitude: dto.latitude,
        longitude: dto.longitude,
        alertId: dto.alertId,
        channel: dto.channel || 'web',
      },
    });
  }

  async createFromBot(dto: { type: any; phone?: string; severity?: number; description?: string; text?: string; latitude?: number; longitude?: number; mediaUrls?: string[] }) {
    // Attribuer le signalement au citoyen identifié par son numéro WhatsApp ;
    // création automatique du compte CITOYEN au 1er signalement (comme le flux OTP).
    let user = null;
    if (dto.phone) {
      const phone = dto.phone.startsWith('+') ? dto.phone : `+${dto.phone}`;
      user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        const defaultZone = await this.prisma.zone.findFirst({
          where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
        });
        user = await this.prisma.user.create({
          data: {
            phone,
            name: `Citoyen ${phone.slice(-4)}`,
            role: 'CITOYEN',
            isActive: true,
            zoneId: defaultZone?.id,
          },
        });
      }
    }
    if (!user) {
      const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
      user = await this.prisma.user.findUnique({ where: { phone: botPhone } });
      if (!user) throw new Error(`Compte bot introuvable (${botPhone}). Vérifiez le seed.`);
    }

    return this.prisma.signalement.create({
      data: {
        userId: user.id,
        type: dto.type,
        text: dto.description || dto.text || '',
        severity: dto.severity,
        mediaUrls: dto.mediaUrls || [],
        latitude: dto.latitude,
        longitude: dto.longitude,
        channel: 'whatsapp',
      },
    });
  }

  async updateStatus(id: string, status: SignalementStatus, reviewerId: string, reviewerRole?: Role) {
    const existing = await this.prisma.signalement.findUnique({
      where: { id },
      include: { user: { select: { zoneId: true, zone: { select: { name: true } } } } },
    });
    if (!existing) throw new NotFoundException(`Signalement ${id} introuvable`);

    const [updated] = await this.prisma.$transaction([
      this.prisma.signalement.update({ where: { id }, data: { status } }),
      this.prisma.auditLog.create({
        data: {
          userId: reviewerId,
          action: `signalement.${status.toLowerCase()}`,
          resource: 'signalement',
          resourceId: id,
          details: { previousStatus: existing.status, newStatus: status },
        },
      }),
    ]);

    // Cursus OLEL : un signalement VALIDÉ entre dans le cycle de vie alerte.
    // L'alerte apparaît dans le flux « en cours » (feed + carte + file par rôle).
    if (status === SignalementStatus.VALIDATED && !existing.alertId) {
      try {
        const label = TYPE_LABEL[existing.type] || existing.type;
        const zoneName = existing.user?.zone?.name;
        const alert = await this.alerts.create(
          {
            title: zoneName ? `${label} — ${zoneName}` : `${label} — signalement citoyen`,
            description: existing.text,
            type: existing.type,
            alertLevel: SEVERITY_TO_LEVEL[existing.severity ?? 1] || AlertLevel.JAUNE,
            severity: existing.severity ?? 1,
            zoneId: existing.user?.zoneId || undefined,
            latitude: existing.latitude ?? undefined,
            longitude: existing.longitude ?? undefined,
            mediaUrls: existing.mediaUrls,
            channel: existing.channel,
          },
          reviewerId,
          reviewerRole,
          { linkSignalementId: id },
        );
        return { ...updated, alertId: alert.id };
      } catch (e) {
        // La validation reste acquise même si la création d'alerte échoue
        this.logger.error(`Transformation signalement ${id} en alerte échouée : ${(e as Error).message}`);
      }
    }

    return updated;
  }
}
