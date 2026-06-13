import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AlertLevel, AlertStatus, AlertStep, AlertType,
  CriticalValidatorCategory, Role, ValidationAction,
} from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';
import {
  LEVEL_CONFIG, CRITICAL_LEVELS,
  canBroadcast, canClose,
  criticalCategory,
  protectionCivileEntryStep, normalizePhase, nextStepFor, canAdvanceAt,
  mayEmergencyBypass, needsConfirmation, PHASE,
  AUTO_ESCALATION_MINUTES,
} from './alert-workflow';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    private gateway: AlertsGateway,
    private audit: AuditService,
  ) {}

  private async enqueueFanout(payload: Record<string, any>) {
    try {
      await this.notifQueue.add('fanout', payload, { attempts: 3, backoff: 5000 });
    } catch (e) {
      this.logger.error(`Échec mise en file fanout: ${(e as Error).message}`);
    }
  }

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

  async getCriticalValidationStatus(alertId: string) {
    const alert = await this.findOne(alertId);
    const cvs = await this.prisma.alertCriticalValidation.findMany({
      where: { alertId },
      include: { validator: { select: { name: true, role: true } } },
    });
    const isCritical = CRITICAL_LEVELS.includes(alert.alertLevel as AlertLevel);
    const hasSentinelle = cvs.some(v => v.validatorCategory === CriticalValidatorCategory.SENTINELLE_CATEGORY);
    const hasLocal      = cvs.some(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_LOCALE);
    const hasAdmin      = cvs.some(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_ADMIN);
    return {
      alertId,
      alertLevel: alert.alertLevel,
      isCritical,
      criticalValidated: hasSentinelle && hasLocal && hasAdmin,
      validations: {
        sentinelle: { required: isCritical, done: hasSentinelle, entries: cvs.filter(v => v.validatorCategory === CriticalValidatorCategory.SENTINELLE_CATEGORY) },
        autoriteLocale: { required: isCritical, done: hasLocal, entries: cvs.filter(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_LOCALE) },
        autoriteAdmin: { required: isCritical, done: hasAdmin, entries: cvs.filter(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_ADMIN) },
      },
    };
  }

  async addCriticalValidation(
    alertId: string,
    validator: { id: string; role: Role },
    comment?: string,
  ) {
    const category = criticalCategory(validator.role);
    if (!category) {
      throw new ForbiddenException(`Le rôle ${validator.role} ne peut pas effectuer de validation critique`);
    }
    const alert = await this.findOne(alertId);
    if (!CRITICAL_LEVELS.includes(alert.alertLevel as AlertLevel)) {
      throw new BadRequestException('Cette alerte ne requiert pas de validation critique (niveau < ORANGE)');
    }

    const cv = await this.prisma.alertCriticalValidation.upsert({
      where: { alertId_validatorId: { alertId, validatorId: validator.id } },
      update: { comment, validatedAt: new Date() },
      create: { alertId, validatorId: validator.id, validatorCategory: category, comment },
    });

    // Vérifier si les 3 catégories sont maintenant couvertes
    const allCvs = await this.prisma.alertCriticalValidation.findMany({ where: { alertId } });
    const done = (
      allCvs.some(v => v.validatorCategory === CriticalValidatorCategory.SENTINELLE_CATEGORY) &&
      allCvs.some(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_LOCALE) &&
      allCvs.some(v => v.validatorCategory === CriticalValidatorCategory.AUTORITE_ADMIN)
    );
    if (done) {
      await this.prisma.alert.update({ where: { id: alertId }, data: { criticalValidated: true } });
    }

    this.audit.log({ userId: validator.id, action: 'alert.critical_validate', resource: 'alert', resourceId: alertId, details: { category, done } });
    return { criticalValidation: cv, allValidated: done };
  }

  async findAll(filters: {
    zoneId?: string; status?: AlertStatus; type?: AlertType;
    step?: AlertStep; alertLevel?: AlertLevel; page?: number; limit?: number;
  }) {
    const { zoneId, status, type, step, alertLevel } = filters;
    // Coercition Int : les query params arrivent en string
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const where: any = {};
    if (zoneId)      where.zoneId = zoneId;
    if (status)      where.status = status;
    if (type)        where.type = type;
    if (step)        where.currentStep = step;
    if (alertLevel)  where.alertLevel = alertLevel;

    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          zone: { select: { name: true, code: true } },
          municipality: { select: { name: true, code: true } },
        },
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
        municipality: { include: { department: { include: { region: true } } } },
        signalements: { take: 10, orderBy: { createdAt: 'desc' } },
        validations: {
          orderBy: { createdAt: 'asc' },
          include: { validator: { select: { name: true, role: true } } },
        },
        criticalValidations: {
          include: { validator: { select: { name: true, role: true } } },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    return alert;
  }

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
    dto: {
      title: string; description: string; type: any;
      alertLevel?: AlertLevel; severity?: number;
      zoneId?: string; municipalityId?: string;
      latitude?: number; longitude?: number;
      mediaUrls?: string[]; channel?: string;
    },
    userId: string,
    creatorRole?: Role,
    opts?: { linkSignalementId?: string },
  ) {
    const level: AlertLevel = dto.alertLevel || AlertLevel.BLEU;

    let currentStep: AlertStep = AlertStep.SIGNALEMENT;
    let status: AlertStatus = AlertStatus.PENDING;

    if (creatorRole === Role.PROTECTION_CIVILE || creatorRole === Role.ADMIN || creatorRole === Role.SUPER_ADMIN) {
      const entry = protectionCivileEntryStep(level);
      currentStep = entry.step;
      status = entry.status;
    } else if (creatorRole === Role.HYDRO_METEO) {
      // Données techniques → entre à PREFECTURE directement
      currentStep = AlertStep.PREFECTURE;
      status = AlertStatus.VALIDATED;
    }

    const zoneId = await this.resolveZoneId(dto.zoneId, userId);

    const alert = await this.prisma.alert.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        alertLevel: level,
        severity: dto.severity || 1,
        status,
        currentStep,
        zoneId,
        municipalityId: dto.municipalityId,
        createdById: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mediaUrls: dto.mediaUrls || [],
        requiresMedicalReview: dto.type === 'EPIDEMIE',
      },
      include: {
        zone: { select: { name: true } },
        municipality: { select: { name: true } },
      },
    });

    try {
      if (opts?.linkSignalementId) {
        // L'alerte naît d'un signalement existant (validation mairie) :
        // on le lie au lieu de créer un doublon.
        await this.prisma.signalement.update({
          where: { id: opts.linkSignalementId },
          data: { alertId: alert.id },
        });
      } else {
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
      }
    } catch (e) {
      this.logger.error(`Échec enregistrement signalement: ${(e as Error).message}`);
    }

    await this.enqueueFanout({ alertId: alert.id });
    this.safeBroadcast(alert);
    return alert;
  }

  async advance(
    alertId: string,
    validator: { id: string; role: Role },
    body: {
      action: ValidationAction;
      alertLevel?: AlertLevel;
      comment?: string; photoUrl?: string;
      latitude?: number; longitude?: number;
      gravity?: number;
    },
  ) {
    const alert = await this.findOne(alertId);

    const TERMINAL: string[] = [
      AlertStatus.REJECTED, AlertStatus.CLOSED, AlertStatus.CANCELLED,
      AlertStatus.BROADCAST, AlertStatus.BROADCASTING,
    ];
    if (TERMINAL.includes(alert.status as string)) {
      throw new ForbiddenException('Alerte deja cloturee ou diffusee');
    }
    if (alert.currentStep === PHASE.DIFFUSEE || alert.currentStep === PHASE.CLOTUREE) {
      throw new ForbiddenException('Etape terminale');
    }
    if (validator.role === Role.RADIO_COMMUNAUTAIRE || validator.role === Role.CITOYEN) {
      throw new ForbiddenException('Role non habilite a valider une alerte');
    }

    const effectiveLevel = (body.alertLevel || alert.alertLevel) as AlertLevel;

    if (!canAdvanceAt(validator.role, alert.currentStep, effectiveLevel) && body.action !== ValidationAction.REJECTED) {
      throw new ForbiddenException(
        `Role ${validator.role} insuffisant pour faire avancer cette alerte (etape ${alert.currentStep} / niveau ${effectiveLevel})`,
      );
    }

    const phase = normalizePhase(alert.currentStep);
    if (phase === PHASE.RECEPTION && body.action !== ValidationAction.REJECTED) {
      if (body.latitude == null || body.longitude == null) {
        throw new BadRequestException('Position GPS obligatoire');
      }
      if (!body.photoUrl && !(alert.mediaUrls && alert.mediaUrls.length)) {
        throw new BadRequestException('Photo de preuve obligatoire');
      }
      if (body.gravity == null || body.gravity < 0 || body.gravity > 3) {
        throw new BadRequestException('Niveau de gravite (0-3) obligatoire');
      }
    }

    let alertData: any = {};
    let willDiffuse = false;

    if (body.action === ValidationAction.REJECTED) {
      alertData = { status: AlertStatus.REJECTED, resolvedAt: new Date() };
    } else {
      const next = nextStepFor(alert.currentStep, effectiveLevel);
      if (!next) throw new ForbiddenException('Aucune transition possible');
      alertData.currentStep = next;
      alertData.status = AlertStatus.VALIDATED;
      if (next === PHASE.VERIFIEE || phase === PHASE.RECEPTION) alertData.verifiedAt = new Date();
      if (body.gravity != null) alertData.severity = Math.max(1, body.gravity);
      willDiffuse = next === PHASE.DIFFUSEE;
    }

    if (effectiveLevel !== alert.alertLevel) alertData.alertLevel = effectiveLevel;

    const [, updated] = await this.prisma.$transaction([
      this.prisma.validation.create({
        data: {
          alertId, validatorId: validator.id,
          approved: body.action !== ValidationAction.REJECTED,
          action: body.action, step: alert.currentStep,
          comment: body.comment, photoUrl: body.photoUrl,
          latitude: body.latitude, longitude: body.longitude, gravity: body.gravity,
        },
      }),
      this.prisma.alert.update({
        where: { id: alertId }, data: alertData,
        include: { zone: { select: { name: true } } },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: validator.id,
          action: `alert.${body.action.toLowerCase()}`,
          resource: 'alert', resourceId: alertId,
          details: { step: alert.currentStep, action: body.action, gravity: body.gravity, alertLevel: effectiveLevel },
        },
      }),
    ]);

    this.safeBroadcast(updated);

    const cfg = LEVEL_CONFIG[effectiveLevel];
    const updatedPhase = normalizePhase(updated.currentStep);
    if (
      body.action !== ValidationAction.REJECTED &&
      cfg.notifyCitizensFromStep === PHASE.VERIFIEE &&
      updatedPhase === PHASE.VERIFIEE &&
      !updated.citizensNotifiedAt
    ) {
      await this.enqueueFanout({ alertId, isBroadcast: true, preview: true });
      await this.prisma.alert.update({ where: { id: alertId }, data: { citizensNotifiedAt: new Date() } });
    }

    if (willDiffuse) await this.autoBroadcast(updated.id, validator);
    return updated;
  }

  /** Diffusion auto en bout de cursus (advance qui aboutit a DIFFUSEE). */
  private async autoBroadcast(alertId: string, validator: { id: string; role: Role }) {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert || alert.broadcastAt) return;
    const cfg = LEVEL_CONFIG[alert.alertLevel as AlertLevel];
    const channels = cfg.channels;
    const message = `[OLEL] ${cfg.label.toUpperCase()} - ${alert.title}\n${alert.description}` +
      (alert.latitude && alert.longitude ? `\nPosition : ${alert.latitude.toFixed(4)},${alert.longitude.toFixed(4)}` : '');
    const broadcast = await this.prisma.broadcast.create({
      data: { alertId, authorId: validator.id, message, targetZoneIds: [alert.zoneId], channels, idempotencyKey: randomUUID() },
    });
    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(), criticalValidated: true },
    });
    await this.enqueueFanout({ alertId, isBroadcast: true, broadcastId: broadcast.id, channels });
    this.audit.log({
      userId: validator.id, action: 'alert.broadcast_auto', resource: 'alert', resourceId: alertId,
      details: { trigger: 'cursus_complete', channels },
    });
  }

  /** Bypass d'urgence MAIRIE+ : court-circuit vers DIFFUSION. */
  async emergencyBypass(alertId: string, user: { id: string; role: Role }, body: { justification: string }) {
    if (!mayEmergencyBypass(user.role)) {
      throw new ForbiddenException("Diffusion d'urgence reservee a MAIRIE ou superieur");
    }
    if (!body.justification || body.justification.trim().length < 10) {
      throw new BadRequestException("Justification (>= 10 caracteres) obligatoire");
    }
    const alert = await this.findOne(alertId);
    if (alert.broadcastAt) throw new ForbiddenException('Alerte deja diffusee');
    const cfg = LEVEL_CONFIG[alert.alertLevel as AlertLevel];
    const channels = cfg.channels;
    const message = `[OLEL] ${cfg.label.toUpperCase()} (URGENCE) - ${alert.title}\n${alert.description}` +
      (alert.latitude && alert.longitude ? `\nPosition : ${alert.latitude.toFixed(4)},${alert.longitude.toFixed(4)}` : '');
    const broadcast = await this.prisma.broadcast.create({
      data: { alertId, authorId: user.id, message, targetZoneIds: [alert.zoneId], channels, idempotencyKey: randomUUID() },
    });
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE,
        broadcastAt: new Date(), verifiedAt: new Date(),
        emergencyBypass: true, bypassJustification: body.justification,
        bypassById: user.id, criticalValidated: true,
      },
      include: { zone: { select: { name: true } } },
    });
    await this.enqueueFanout({ alertId, isBroadcast: true, broadcastId: broadcast.id, channels });
    this.safeBroadcast(updated);
    this.audit.log({
      userId: user.id, action: 'alert.emergency_bypass', resource: 'alert', resourceId: alertId,
      details: { justification: body.justification, channels, role: user.role },
    });
    return updated;
  }

  /** Scheduler : auto-diffusion des ROUGE/ROUGE_FONCE non confirmees a temps. */
  async autoEscalateStale(): Promise<number> {
    const cutoff = new Date(Date.now() - AUTO_ESCALATION_MINUTES * 60 * 1000);
    const stale = await this.prisma.alert.findMany({
      where: {
        currentStep: PHASE.VERIFIEE,
        alertLevel: { in: [AlertLevel.ROUGE, AlertLevel.ROUGE_FONCE] },
        broadcastAt: null,
        verifiedAt: { lt: cutoff },
      },
    });
    for (const a of stale) {
      const cfg = LEVEL_CONFIG[a.alertLevel as AlertLevel];
      const broadcast = await this.prisma.broadcast.create({
        data: {
          alertId: a.id, authorId: a.createdById,
          message: `[OLEL] ${cfg.label.toUpperCase()} (non confirmee par l'autorite - auto-diffusion ${AUTO_ESCALATION_MINUTES} min) - ${a.title}\n${a.description}`,
          targetZoneIds: [a.zoneId], channels: cfg.channels, idempotencyKey: randomUUID(),
        },
      });
      await this.prisma.alert.update({
        where: { id: a.id },
        data: { status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(), autoEscalated: true },
      });
      await this.enqueueFanout({ alertId: a.id, isBroadcast: true, broadcastId: broadcast.id, channels: cfg.channels });
      this.audit.log({
        userId: a.createdById, action: 'alert.auto_escalated', resource: 'alert', resourceId: a.id,
        details: { reason: `non confirmee apres ${AUTO_ESCALATION_MINUTES} min`, level: a.alertLevel },
      });
    }
    if (stale.length) this.logger.warn(`Auto-escalade : ${stale.length} alerte(s) diffusee(s) faute de confirmation`);
    return stale.length;
  }

  async broadcast(
    alertId: string,
    user: { id: string; role: Role },
    dto: { message?: string; targetZoneIds?: string[]; channels?: string[]; idempotencyKey?: string },
  ) {
    const alert = await this.findOne(alertId);
    if (!canBroadcast(user.role)) {
      throw new ForbiddenException('Diffusion reservee a MAIRIE ou superieur');
    }
    if (alert.broadcastAt) throw new ForbiddenException('Alerte deja diffusee');
    const phase = normalizePhase(alert.currentStep);
    const needsConf = needsConfirmation(alert.alertLevel as AlertLevel);
    if (phase === PHASE.RECEPTION) {
      throw new ForbiddenException('Alerte non verifiee - passez par /advance');
    }
    if (needsConf && phase !== PHASE.CONFIRMEE && !alert.emergencyBypass) {
      throw new ForbiddenException('Niveau ROUGE/ROUGE_FONCE : confirmation autorite requise');
    }

    const cfg = LEVEL_CONFIG[alert.alertLevel as AlertLevel];
    const channels = dto.channels || cfg.channels;
    const targetZoneIds = dto.targetZoneIds || [alert.zoneId];
    const message = dto.message || `[OLEL] ${cfg.label.toUpperCase()} - ${alert.title}\n${alert.description}`;

    const broadcastRecord = await this.prisma.broadcast.create({
      data: { alertId, authorId: user.id, message, targetZoneIds, channels, idempotencyKey: dto.idempotencyKey || randomUUID() },
    });
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(), criticalValidated: true },
      include: { zone: { select: { name: true } } },
    });
    await this.enqueueFanout({ alertId, isBroadcast: true, broadcastId: broadcastRecord.id, channels });
    this.safeBroadcast(updated);
    this.audit.log({
      userId: user.id, action: 'alert.broadcast', resource: 'alert', resourceId: alertId,
      details: { alertLevel: alert.alertLevel, channels, targetZoneIds },
    });
    return { alert: updated, broadcast: broadcastRecord };
  }

  async close(alertId: string, user: { id: string; role: Role }, reason: string) {
    const alert = await this.findOne(alertId);
    if (!canClose(user.role)) {
      throw new ForbiddenException('Rôle insuffisant pour clôturer');
    }
    if (alert.status !== AlertStatus.BROADCAST) {
      throw new ForbiddenException(
        `Seule une alerte diffusée peut être clôturée (statut actuel : ${alert.status})`,
      );
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Raison de clôture obligatoire (3 caractères minimum)');
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.CLOSED,
        currentStep: AlertStep.CLOSED,
        closedAt: new Date(),
        closureReason: reason,
        resolvedAt: new Date(),
      },
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    this.audit.log({ userId: user.id, action: 'alert.close', resource: 'alert', resourceId: alertId, details: { reason } });
    return updated;
  }

  async getQueue(user: { id: string; role: Role }) {
    const caller = await this.prisma.user.findUnique({ where: { id: user.id }, select: { zoneId: true } });
    const zoneFilter = caller?.zoneId ? { zoneId: caller.zoneId } : {};

    let where: any = { ...zoneFilter };
    if (user.role === Role.RADIO_COMMUNAUTAIRE) {
      // Les radios ne valident pas : elles reçoivent les alertes diffusées à relayer
      where = { ...where, status: AlertStatus.BROADCAST };
    } else if (user.role === Role.SENTINELLE) {
      where = { ...where, currentStep: AlertStep.SIGNALEMENT, status: AlertStatus.PENDING };
    } else if (user.role === Role.COORDINATEUR) {
      where = { ...where, currentStep: AlertStep.SENTINELLE, status: AlertStatus.UNDER_REVIEW };
    } else if (user.role === Role.MAIRIE || user.role === Role.HYDRO_METEO) {
      where = { ...where, currentStep: AlertStep.COORDINATEUR, status: AlertStatus.UNDER_REVIEW };
    } else if (user.role === Role.PREFECTURE) {
      where = { ...where, currentStep: AlertStep.MAIRIE, status: AlertStatus.UNDER_REVIEW };
    } else {
      where = { ...where, currentStep: AlertStep.PREFECTURE, status: AlertStatus.VALIDATED };
    }

    return this.prisma.alert.findMany({
      where,
      orderBy: [{ alertLevel: 'desc' }, { severity: 'desc' }, { createdAt: 'asc' }],
      include: {
        zone: { select: { name: true, code: true } },
        municipality: { select: { name: true } },
        criticalValidations: true,
      },
      take: 50,
    });
  }

  async medicalClearance(alertId: string, user: { id: string; role: Role }) {
    if (
      user.role !== Role.PROTECTION_CIVILE &&
      user.role !== Role.ADMIN &&
      user.role !== Role.SUPER_ADMIN
    ) {
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

  async getBroadcasts(alertId?: string) {
    return this.prisma.broadcast.findMany({
      where: alertId ? { alertId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { name: true, role: true } },
        alert: { select: { title: true, alertLevel: true, type: true } },
      },
    });
  }
}

function hasLevelMin(role: Role, min: Role): boolean {
  const levels: Record<Role, number> = {
    CITOYEN: 0, SENTINELLE: 1, RADIO_COMMUNAUTAIRE: 1, COORDINATEUR: 2,
    MAIRIE: 3, HYDRO_METEO: 3, PREFECTURE: 4,
    GOUVERNORAT: 5, PROTECTION_CIVILE: 5, SUPERVISEUR_REGIONAL: 6,
    ADMIN: 99, SUPER_ADMIN: 99,
  };
  return levels[role] >= levels[min];
}
