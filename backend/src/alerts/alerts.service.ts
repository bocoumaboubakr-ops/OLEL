import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertStatus, AlertStep, AlertType, Role, ValidationAction } from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';
import { WORKFLOW, canAdvance, canBroadcast, canClose } from './alert-workflow';
import { AuditService } from '../audit/audit.service';

/** Types déclenchant l'auto-escalade URGENCE (gravité 3 → skip Mairie+Préfecture). */
const URGENCE_TYPES: AlertType[] = [AlertType.INCENDIE, AlertType.ACCIDENT_INDUSTRIEL];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    private gateway: AlertsGateway,
    private audit: AuditService,
  ) {}

  /** Enfile un job de fanout sans faire échouer la requête si Redis est indisponible. */
  private async enqueueFanout(payload: Record<string, any>) {
    try {
      await this.notifQueue.add('fanout', payload, { attempts: 3, backoff: 5000 });
    } catch (e) {
      this.logger.error(`Échec mise en file fanout: ${(e as Error).message}`);
    }
  }

  /** Push WS best-effort. */
  private safeBroadcast(alert: any) {
    try {
      this.gateway.broadcastAlert(alert);
    } catch (e) {
      this.logger.error(`Échec broadcast WS: ${(e as Error).message}`);
    }
  }

  async getHistory(alertId: string) {
    return this.prisma.validation.findMany({
      where: { alertId },
      orderBy: { createdAt: 'asc' },
      include: { validator: { select: { name: true, role: true } } },
    });
  }

  async findAll(filters: { zoneId?: string; status?: AlertStatus; type?: AlertType; step?: AlertStep; page?: number; limit?: number }) {
    const { zoneId, status, type, step, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (zoneId) where.zoneId = zoneId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (step) where.currentStep = step;

    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { zone: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { alerts, total, page, limit };
  }

  async findOne(id: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        zone: true,
        signalements: { take: 10, orderBy: { createdAt: 'desc' } },
        validations: {
          orderBy: { createdAt: 'asc' },
          include: { validator: { select: { name: true, role: true } } },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    return alert;
  }

  /**
   * Résout la zone d'un signalement : zone fournie → zone de l'utilisateur →
   * zone racine par défaut (Matam). Garantit qu'un citoyen peut signaler sans
   * connaître l'UUID de sa zone (cf. ARCHITECTURE_OLEL.md Workflow 1).
   */
  private async resolveZoneId(zoneId: string | undefined, userId: string): Promise<string> {
    if (zoneId) return zoneId;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { zoneId: true } });
    if (user?.zoneId) return user.zoneId;
    const root = await this.prisma.zone.findFirst({
      where: { parentId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!root) throw new BadRequestException('Aucune zone configurée — contactez l\'administrateur');
    return root.id;
  }

  async create(
    dto: { title: string; description: string; type: any; severity?: number; zoneId?: string; latitude?: number; longitude?: number; mediaUrls?: string[]; channel?: string },
    userId: string,
    creatorRole?: Role,
  ) {
    // Cas spéciaux du cursus : origine officielle peut entrer plus haut dans la chaîne
    let currentStep: AlertStep = AlertStep.SIGNALEMENT;
    let status: AlertStatus = AlertStatus.PENDING;
    if (creatorRole === Role.PROTECTION_CIVILE) {
      // Origine officielle (centre de santé, etc.) → entre directement à PREFECTURE/VALIDATED
      // Pas d'étape sentinelle ni mairie (cf. CURSUS_ALERTE.md §Sanitaire)
      currentStep = AlertStep.PREFECTURE;
      status = AlertStatus.VALIDATED;
    }

    const zoneId = await this.resolveZoneId(dto.zoneId, userId);

    const alert = await this.prisma.alert.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        severity: dto.severity || 2,
        status,
        currentStep,
        zoneId,
        createdById: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mediaUrls: dto.mediaUrls || [],
        requiresMedicalReview: dto.type === 'EPIDEMIE',
      },
      include: { zone: { select: { name: true } } },
    });

    // Trace de provenance : enregistre le signalement lié (canal d'origine)
    try {
      await this.prisma.signalement.create({
        data: {
          userId,
          alertId: alert.id,
          type: dto.type,
          text: dto.description,
          mediaUrls: dto.mediaUrls || [],
          latitude: dto.latitude,
          longitude: dto.longitude,
          channel: dto.channel || 'app',
        },
      });
    } catch (e) {
      this.logger.error(`Échec enregistrement signalement de provenance: ${(e as Error).message}`);
    }

    await this.enqueueFanout({ alertId: alert.id });
    this.safeBroadcast(alert);

    return alert;
  }

  /**
   * Fait avancer une alerte dans le cursus (action sentinelle / mairie / préfecture).
   * action: VALIDATED → avance d'une étape ; REJECTED → ferme ; ESCALATED → avance + flag.
   */
  async advance(
    alertId: string,
    validator: { id: string; role: Role },
    body: { action: ValidationAction; comment?: string; photoUrl?: string; latitude?: number; longitude?: number; gravity?: number },
  ) {
    const alert = await this.findOne(alertId);
    const def = WORKFLOW[alert.currentStep];

    // États terminaux : aucune action possible
    const TERMINAL: string[] = [AlertStatus.REJECTED, AlertStatus.CLOSED, AlertStatus.CANCELLED, AlertStatus.BROADCAST, AlertStatus.BROADCASTING];
    if (TERMINAL.includes(alert.status as string)) {
      throw new ForbiddenException('Alerte déjà clôturée ou diffusée — aucune action possible');
    }
    if (alert.currentStep === AlertStep.BROADCAST || alert.currentStep === AlertStep.CLOSED) {
      throw new ForbiddenException('Cette étape ne se valide pas (diffusion/clôture via endpoints dédiés)');
    }
    // Étape PREFECTURE → uniquement via broadcast(), pas advance()
    if (alert.currentStep === AlertStep.PREFECTURE) {
      throw new ForbiddenException('Alerte validée par la préfecture — utilisez l\'action Diffuser');
    }
    if (!canAdvance(validator.role, alert.currentStep)) {
      throw new ForbiddenException(`Rôle ${validator.role} insuffisant pour l'étape ${alert.currentStep}`);
    }

    // Règle métier : validation sentinelle exige GPS + photo + gravité
    if (alert.currentStep === AlertStep.SIGNALEMENT && body.action !== ValidationAction.REJECTED) {
      if (body.latitude == null || body.longitude == null) {
        throw new BadRequestException('Position GPS obligatoire pour valider un signalement');
      }
      if (!body.photoUrl) {
        throw new BadRequestException('Photo de preuve obligatoire pour valider un signalement');
      }
      if (body.gravity == null || body.gravity < 0 || body.gravity > 3) {
        throw new BadRequestException('Niveau de gravité (0-3) obligatoire');
      }
    }

    // Cas URGENCE : gravité 3 + type critique → auto-escalade direct PREFECTURE/VALIDATED
    // Skip Mairie+Préfecture (cf. CURSUS_ALERTE.md §URGENCE auto-broadcast)
    const isUrgence =
      alert.currentStep === AlertStep.SIGNALEMENT &&
      body.action !== ValidationAction.REJECTED &&
      (body.gravity === 3 || alert.severity >= 3) &&
      URGENCE_TYPES.includes(alert.type as AlertType);

    let alertData: any;
    if (body.action === ValidationAction.REJECTED) {
      alertData = { status: AlertStatus.REJECTED, resolvedAt: new Date() };
    } else if (isUrgence) {
      alertData = { currentStep: AlertStep.PREFECTURE, status: AlertStatus.VALIDATED };
      if (body.gravity != null) alertData.severity = body.gravity;
    } else {
      alertData = { currentStep: def.next, status: def.nextStatus };
      if (body.gravity != null) alertData.severity = Math.max(1, body.gravity);
      if (body.action === ValidationAction.ESCALATED) {
        alertData.currentStep = AlertStep.PREFECTURE;
        alertData.status = AlertStatus.VALIDATED;
      }
    }

    // Transaction atomique : validation + mise à jour alerte + audit
    const [, updated] = await this.prisma.$transaction([
      this.prisma.validation.create({
        data: {
          alertId,
          validatorId: validator.id,
          approved: body.action !== ValidationAction.REJECTED,
          action: body.action,
          step: alert.currentStep,
          comment: body.comment,
          photoUrl: body.photoUrl,
          latitude: body.latitude,
          longitude: body.longitude,
          gravity: body.gravity,
        },
      }),
      this.prisma.alert.update({
        where: { id: alertId },
        data: alertData,
        include: { zone: { select: { name: true } } },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: validator.id,
          action: `alert.${body.action.toLowerCase()}`,
          resource: 'alert',
          resourceId: alertId,
          details: { step: alert.currentStep, action: body.action, gravity: body.gravity },
        },
      }),
    ]);

    this.safeBroadcast(updated);
    return updated;
  }

  /** Diffusion (préfecture+) : VALIDATED → BROADCASTING → BROADCAST. */
  async broadcast(alertId: string, user: { id: string; role: Role }) {
    const alert = await this.findOne(alertId);
    if (!canBroadcast(user.role)) {
      throw new ForbiddenException('Seule la préfecture (ou plus) peut diffuser');
    }
    // Doit être à l'étape PREFECTURE avec statut VALIDATED (les deux conditions)
    if (alert.currentStep !== AlertStep.PREFECTURE || alert.status !== AlertStatus.VALIDATED) {
      throw new ForbiddenException(
        `Diffusion impossible : l'alerte doit être à l'étape Préfecture avec statut Validée (actuel : étape ${alert.currentStep}, statut ${alert.status})`,
      );
    }
    if (alert.requiresMedicalReview) {
      throw new ForbiddenException('Validation médicale requise avant diffusion — contactez le service de santé');
    }
    if (alert.requiresConsent && !alert.consentObtained) {
      throw new ForbiddenException('Consentement requis avant diffusion');
    }

    // Idempotency : update conditionnel sur broadcastAt IS NULL (anti-double-diffusion)
    const { count } = await this.prisma.alert.updateMany({
      where: { id: alertId, broadcastAt: null },
      data: { status: AlertStatus.BROADCAST, currentStep: AlertStep.BROADCAST, broadcastAt: new Date() },
    });
    if (count === 0) {
      throw new ForbiddenException('Alerte déjà diffusée — opération idempotente ignorée');
    }

    await this.enqueueFanout({ alertId, isBroadcast: true });

    const updated = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    this.audit.log({ userId: user.id, action: 'alert.broadcast', resource: 'alert', resourceId: alertId, details: { step: AlertStep.BROADCAST } });
    return updated;
  }

  /**
   * File d'attente personnalisée par rôle :
   * - SENTINELLE : alertes PENDING (step=SIGNALEMENT) dans la zone du caller
   * - MAIRIE+    : alertes UNDER_REVIEW step=SENTINELLE dans la zone du caller
   * - PREFECTURE+: alertes UNDER_REVIEW step=MAIRIE dans la zone du caller
   */
  async getQueue(user: { id: string; role: Role }) {
    const caller = await this.prisma.user.findUnique({ where: { id: user.id }, select: { zoneId: true } });
    const zoneFilter = caller?.zoneId ? { zoneId: caller.zoneId } : {};

    let where: any = { ...zoneFilter };
    if (user.role === Role.SENTINELLE) {
      where = { ...where, currentStep: AlertStep.SIGNALEMENT, status: AlertStatus.PENDING };
    } else if (user.role === Role.MAIRIE) {
      where = { ...where, currentStep: AlertStep.SENTINELLE, status: AlertStatus.UNDER_REVIEW };
    } else {
      // PREFECTURE+ : alertes en attente de validation préfecture
      where = { ...where, currentStep: AlertStep.MAIRIE, status: AlertStatus.UNDER_REVIEW };
    }

    return this.prisma.alert.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      include: { zone: { select: { name: true, code: true } } },
      take: 50,
    });
  }

  /** Levée de blocage médical (PROTECTION_CIVILE uniquement). */
  async medicalClearance(alertId: string, user: { id: string; role: Role }) {
    if (user.role !== Role.PROTECTION_CIVILE && user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Seule la Protection Civile peut lever le blocage médical');
    }
    const alert = await this.findOne(alertId);
    if (!alert.requiresMedicalReview) {
      throw new BadRequestException('Aucun blocage médical actif sur cette alerte');
    }
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { requiresMedicalReview: false },
      include: { zone: { select: { name: true } } },
    });
    this.audit.log({ userId: user.id, action: 'alert.medical_clearance', resource: 'alert', resourceId: alertId, details: {} });
    this.safeBroadcast(updated);
    return updated;
  }

  /** Clôture (mairie+) : BROADCAST → CLOSED, raison obligatoire. */
  async close(alertId: string, user: { id: string; role: Role }, reason: string) {
    const alert = await this.findOne(alertId);
    if (!canClose(user.role)) {
      throw new ForbiddenException('Rôle insuffisant pour clôturer');
    }
    if (alert.status !== AlertStatus.BROADCAST) {
      throw new ForbiddenException(
        `Seule une alerte diffusée (BROADCAST) peut être clôturée (statut actuel : ${alert.status})`,
      );
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Raison de clôture obligatoire (3 caractères minimum)');
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.CLOSED, currentStep: AlertStep.CLOSED, closedAt: new Date(), closureReason: reason, resolvedAt: new Date() },
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    this.audit.log({ userId: user.id, action: 'alert.close', resource: 'alert', resourceId: alertId, details: { reason } });
    return updated;
  }
}
