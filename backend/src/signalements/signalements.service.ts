import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { TerritoryService } from '../common/territory/territory.service';
import { TERRITORY_EXEMPT } from '../users/user-policy';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { levelFromDeclaredSeverity } from '../alerts/alert-workflow';
import { AccountStatus, LocationSource, Prisma, Role, SignalementStatus } from '@prisma/client';
import { accountStatusData } from '../auth/account-status';

const TYPE_LABEL: Record<string, string> = {
  INONDATION: 'Inondation', SECHERESSE: 'Sécheresse', INCENDIE: 'Incendie',
  TEMPETE: 'Tempête', EPIDEMIE: 'Épidémie', LOCUSTES: 'Criquets',
  ACCIDENT_INDUSTRIEL: 'Accident industriel', MOUVEMENT_DE_TERRAIN: 'Mouvement de terrain',
  AUTRE: 'Danger signalé',
};

@Injectable()
export class SignalementsService {
  private readonly logger = new Logger(SignalementsService.name);

  constructor(private prisma: PrismaService, private alerts: AlertsService, private territory: TerritoryService) {}

  /**
   * Zones dont un opérateur voit et traite les signalements (audit F08/F09) :
   *  - son territoire (sa zone et TOUS ses descendants, parcours récursif) ;
   *  - ses zones ascendantes : signalements « non localisés » d'un citoyen
   *    rattaché à la région ou au département (commune inconnue), que
   *    l'opérateur local doit pouvoir trier. Jamais les zones sœurs.
   * null = sans restriction (administration).
   */
  private async scopeZones(actor: { role?: Role; zoneId?: string | null }): Promise<string[] | null> {
    if (actor.role && TERRITORY_EXEMPT.includes(actor.role)) return null;
    if (!actor.zoneId) return [];
    const [down, up] = await Promise.all([this.territory.subtree(actor.zoneId), this.territory.ancestorsInclusive(actor.zoneId)]);
    return [...new Set([...down, ...up])];
  }

  private async assertInScope(zoneId: string | null | undefined, actor: { role?: Role; zoneId?: string | null }) {
    const zones = await this.scopeZones(actor);
    if (zones === null) return;
    if (!zoneId || !zones.includes(zoneId)) throw new ForbiddenException('Ce signalement est hors de votre territoire');
  }

  async findAll(
    params: { page?: number; limit?: number; status?: SignalementStatus; zoneId?: string },
    caller: { role: Role; zoneId?: string | null },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;

    const zones = await this.scopeZones(caller);
    if (zones !== null) where.user = { zoneId: { in: params.zoneId ? zones.filter((z) => z === params.zoneId) : zones } };
    else if (params.zoneId) where.user = { zoneId: params.zoneId };

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
          fieldVerifiedBy: { select: { id: true, name: true, phone: true } },
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

  async createFromBot(dto: { type: any; phone?: string; severity?: number; language?: string; description?: string; text?: string; latitude?: number; longitude?: number; mediaUrls?: string[]; messageId?: string; subtype?: string }) {
    return this.createFromChannel({
      ...dto, channel: 'whatsapp',
      sourceRef: dto.messageId ? `wa:${dto.messageId}` : undefined,
    });
  }

  /**
   * Réception d'un signalement par un canal sans compte connecté (WhatsApp,
   * USSD, SVI). Attribué au citoyen identifié par son numéro (compte créé au
   * premier signalement). Idempotent sur `sourceRef` : une même réception
   * répétée par le fournisseur renvoie le signalement déjà enregistré.
   * Renvoie `duplicate: true` dans ce cas (audit F06, F25).
   */
  async createFromChannel(dto: {
    type: any; channel: 'whatsapp' | 'ussd' | 'ivr'; sourceRef?: string; subtype?: string;
    phone?: string; severity?: number; language?: string; description?: string; text?: string;
    latitude?: number; longitude?: number; mediaUrls?: string[];
  }) {
    if (dto.sourceRef) {
      const existing = await this.prisma.signalement.findUnique({ where: { sourceRef: dto.sourceRef } });
      if (existing) return { ...existing, duplicate: true };
    }
    const lang = ['fr', 'ff', 'wo', 'snk'].includes(dto.language || '') ? dto.language! : 'fr';
    let user = null;
    if (dto.phone) {
      const phone = dto.phone.startsWith('+') ? dto.phone : `+${dto.phone}`;
      user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        const defaultZone = await this.prisma.zone.findFirst({
          where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
        });
        try {
          user = await this.prisma.user.create({
            data: {
              phone,
              name: `Citoyen ${phone.slice(-4)}`,
              role: 'CITOYEN',
              ...accountStatusData(AccountStatus.ACTIVE),
              language: lang,
              zoneId: defaultZone?.id,
            },
          });
        } catch (e) {
          // Deux réceptions simultanées d'un nouveau numéro : le compte vient d'être créé par l'autre
          if ((e as Prisma.PrismaClientKnownRequestError).code !== 'P2002') throw e;
          user = await this.prisma.user.findUniqueOrThrow({ where: { phone } });
        }
      } else if (dto.language && user.language !== lang) {
        // Mémoriser la langue choisie pour les futures notifications
        await this.prisma.user.update({ where: { id: user.id }, data: { language: lang } });
      }
    }
    if (!user) {
      const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
      user = await this.prisma.user.findUnique({ where: { phone: botPhone } });
      if (!user) throw new Error(`Compte bot introuvable (${botPhone}). Vérifiez le seed.`);
    }

    try {
      const created = await this.prisma.signalement.create({
        data: {
          userId: user.id,
          type: dto.type,
          text: dto.description || dto.text || '',
          severity: dto.severity,
          mediaUrls: dto.mediaUrls || [],
          latitude: dto.latitude,
          longitude: dto.longitude,
          channel: dto.channel,
          sourceRef: dto.sourceRef,
          subtype: dto.subtype,
        },
      });
      return { ...created, duplicate: false };
    } catch (e) {
      // Deux réceptions simultanées du même message : la seconde renvoie la première
      if (dto.sourceRef && (e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        const existing = await this.prisma.signalement.findUnique({ where: { sourceRef: dto.sourceRef } });
        if (existing) return { ...existing, duplicate: true };
      }
      throw e;
    }
  }

  /**
   * Le cursus OLEL exige une vérification terrain par une SENTINELLE avant
   * validation MAIRIE quand le signalement initial ne porte aucune preuve
   * (pas de GPS ET pas de photo) — typique d'un signalement WhatsApp texte.
   * Les rôles supérieurs (PREFECTURE et au-dessus) peuvent passer outre.
   */
  private needsFieldVerification(s: { latitude?: number | null; longitude?: number | null; mediaUrls: string[]; fieldVerifiedAt: Date | null }): boolean {
    if (s.fieldVerifiedAt) return false;
    const hasGps = s.latitude != null && s.longitude != null;
    const hasMedia = (s.mediaUrls?.length ?? 0) > 0;
    return !hasGps && !hasMedia;
  }

  /** Vérification terrain par une sentinelle/coordinateur (avec GPS obligatoire). */
  async fieldVerify(
    id: string,
    dto: { latitude: number; longitude: number; mediaUrls?: string[]; notes?: string; locationSource?: LocationSource; locationAccuracyM?: number },
    verifier: { id: string; role: Role; zoneId?: string | null },
  ) {
    const existing = await this.prisma.signalement.findUnique({
      where: { id },
      include: { user: { select: { zoneId: true } } },
    });
    if (!existing) throw new NotFoundException(`Signalement ${id} introuvable`);
    if (existing.status !== SignalementStatus.PENDING) {
      throw new BadRequestException('Le signalement n\'est plus en attente');
    }
    if (existing.fieldVerifiedAt) {
      throw new BadRequestException('Vérification terrain déjà effectuée');
    }
    await this.assertInScope(existing.user?.zoneId, verifier);

    const [updated] = await this.prisma.$transaction([
      this.prisma.signalement.update({
        where: { id },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          mediaUrls: dto.mediaUrls?.length ? [...existing.mediaUrls, ...dto.mediaUrls] : existing.mediaUrls,
          fieldVerifiedAt: new Date(),
          fieldVerifiedById: verifier.id,
          fieldNotes: dto.notes,
          fieldLocationSource: dto.locationSource,
          fieldLocationAccuracyM: dto.locationAccuracyM,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: verifier.id,
          action: 'signalement.field_verified',
          resource: 'signalement',
          resourceId: id,
          details: { latitude: dto.latitude, longitude: dto.longitude, photos: dto.mediaUrls?.length || 0 },
        },
      }),
    ]);
    return updated;
  }

  async updateStatus(id: string, status: SignalementStatus, reviewerId: string, reviewerRole?: Role, reviewerZoneId?: string | null) {
    const existing = await this.prisma.signalement.findUnique({
      where: { id },
      include: { user: { select: { zoneId: true, zone: { select: { name: true } } } } },
    });
    if (!existing) throw new NotFoundException(`Signalement ${id} introuvable`);
    await this.assertInScope(existing.user?.zoneId, { role: reviewerRole, zoneId: reviewerZoneId });
    if (status !== SignalementStatus.VALIDATED && status !== SignalementStatus.REJECTED) {
      throw new BadRequestException('Statut attendu : VALIDATED ou REJECTED');
    }
    // Zone de l'alerte : celle du citoyen si elle est dans le territoire du
    // validateur ; sinon (signalement non localisé, citoyen rattaché à une zone
    // parente) l'opérateur le prend en charge dans SA zone — jamais une
    // alerte régionale créée par défaut.
    const citizenZone = existing.user?.zoneId ?? null;
    const alertZoneId = !reviewerZoneId || (reviewerRole && TERRITORY_EXEMPT.includes(reviewerRole)) || (citizenZone && (await this.territory.isWithin(citizenZone, reviewerZoneId)))
      ? citizenZone ?? reviewerZoneId ?? undefined
      : reviewerZoneId;

    // Garde du cursus : on ne valide pas en aveugle un signalement WhatsApp
    // sans preuve. Seul PREFECTURE+ peut passer outre (cas exceptionnel).
    const isLocalMairie = reviewerRole === Role.MAIRIE;
    if (
      status === SignalementStatus.VALIDATED &&
      isLocalMairie &&
      this.needsFieldVerification(existing)
    ) {
      throw new BadRequestException(
        'Vérification terrain par une sentinelle requise (signalement sans GPS ni photo). Demandez à une sentinelle de confirmer sur place avant validation.',
      );
    }

    // Une seule transaction : statut du signalement (conditionnel), création
    // de l'alerte, notification interne, audit. Si l'alerte ne peut pas être
    // créée, rien n'est validé (audit F17).
    let created: any = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.signalement.updateMany({ where: { id, status: existing.status, alertId: existing.alertId }, data: { status } });
      if (count !== 1) throw new ConflictException('Ce signalement a été traité entre-temps — rechargez');
      await tx.auditLog.create({
        data: {
          userId: reviewerId, action: `signalement.${status.toLowerCase()}`, resource: 'signalement', resourceId: id,
          details: { previousStatus: existing.status, newStatus: status },
        },
      });
      if (status === SignalementStatus.VALIDATED && !existing.alertId) {
        const label = TYPE_LABEL[existing.type] || existing.type;
        const zoneName = existing.user?.zone?.name;
        created = await this.alerts.create(
          {
            title: zoneName ? `${label} — ${zoneName}` : `${label} — signalement citoyen`,
            description: existing.text,
            type: existing.type,
            alertLevel: levelFromDeclaredSeverity(existing.severity),
            subtype: existing.subtype ?? undefined,
            severity: existing.severity ?? 1,
            zoneId: alertZoneId || undefined,
            latitude: existing.latitude ?? undefined,
            longitude: existing.longitude ?? undefined,
            mediaUrls: existing.mediaUrls,
            channel: existing.channel,
          },
          reviewerId,
          reviewerRole,
          { linkSignalementId: id, tx },
        );
      }
      return tx.signalement.findUnique({ where: { id } });
    });

    if (created) {
      await this.alerts.publishCreated(created);
      return { ...updated, alertId: created.id };
    }
    return updated;
  }
}
