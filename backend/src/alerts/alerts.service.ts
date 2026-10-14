import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AlertLevel, AlertStatus, AlertStep, AlertType, BroadcastCertainty, BroadcastKind,
  CriticalValidatorCategory, Prisma, Role, ValidationAction,
} from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';
import {
  LEVEL_CONFIG, CRITICAL_LEVELS, criticalCategory, canClose,
  protectionCivileEntryStep, normalizePhase, nextStepFor, PHASE,
  AUTO_ESCALATION_MINUTES, hasLevel,
} from './alert-workflow';
import {
  AlertFacts, refuseAdvance, refuseBroadcast, refuseBypass, autoEscalationEligible,
  prealertEligible, routingLevel, TERMINAL_STATUSES, DIFFUSED_STATUSES, PUBLIC_ACTIVE_STATUSES,
} from './alert-policy';
import { AuditService } from '../audit/audit.service';
import { TerritoryService } from '../common/territory/territory.service';
import { BroadcastDispatcher } from '../notifications/broadcast-dispatcher.service';
import { FlagsService } from '../flags/flags.service';
import { buildFrozenPayload, Certainty } from '../common/i18n/alert-messages';
import { TERRITORY_EXEMPT } from '../users/user-policy';
import { randomUUID } from 'crypto';

/** Canaux acceptés pour une diffusion : ceux réellement mis en œuvre (audit F26). */
export const AVAILABLE_CHANNELS = ['app', 'whatsapp', 'sms'];

/** Indicateurs opérationnels : automatismes de diffusion désactivés par défaut (décision D3). */
export const FLAG_PREALERT = 'prealert_red';
export const FLAG_AUTO_ESCALATION = 'auto_escalation_red';

type OperatorCtx = { id: string; role: Role; zoneId?: string | null };

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: AlertsGateway,
    private audit: AuditService,
    private territory: TerritoryService,
    private dispatcher: BroadcastDispatcher,
    private flags: FlagsService,
  ) {}

  /** Après validation de la transaction : remise à la file (reprise automatique si échec). */
  private async afterCommit(broadcastIds: string[], alert: { id: string }) {
    for (const id of broadcastIds) await this.dispatcher.kick(id);
    try {
      await this.gateway.alertChanged(alert.id);
    } catch (e) {
      this.logger.error(`Échec notification temps réel : ${(e as Error).message}`);
    }
  }

  /** À appeler après la validation d'une transaction externe ayant créé une alerte (create avec opts.tx). */
  async publishCreated(alert: { id: string; _intentId?: string }) {
    await this.afterCommit(alert._intentId ? [alert._intentId] : [], alert);
  }

  /** Lit l'état courant d'une alerte sous la forme attendue par alert-policy. */
  private async loadFacts(alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { zone: { select: { name: true } }, validations: { select: { validatorId: true, approved: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    const facts: AlertFacts = {
      status: alert.status, currentStep: alert.currentStep, alertLevel: alert.alertLevel,
      broadcastAt: alert.broadcastAt, requiresMedicalReview: alert.requiresMedicalReview,
      createdById: alert.createdById,
      priorValidatorIds: alert.validations.filter((v) => v.approved).map((v) => v.validatorId),
    };
    return { alert, facts };
  }

  /** Le territoire de l'acteur doit contenir la zone de l'alerte (audit F08). */
  private async assertTerritory(actor: OperatorCtx, zoneId: string) {
    if (TERRITORY_EXEMPT.includes(actor.role)) return;
    if (!(await this.territory.isWithin(zoneId, actor.zoneId))) {
      throw new ForbiddenException('Cette alerte est hors de votre territoire');
    }
  }

  private deny(reason: string | null, actor: OperatorCtx, alertId: string, action: string) {
    if (!reason) return;
    this.audit.log({ userId: actor.id, action: `${action}.denied`, resource: 'alert', resourceId: alertId, details: { reason, role: actor.role } });
    throw new ForbiddenException(reason);
  }

  /** Canaux demandés ∩ canaux disponibles ∩ canaux activés ; refus explicite sinon. */
  private async resolveChannels(requested: string[] | undefined, level: AlertLevel): Promise<string[]> {
    // Par défaut : canaux du niveau effectivement mis en œuvre en envoi
    // (l'USSD est consulté par le citoyen, le SVI n'est pas implémenté — F26).
    // Un canal demandé explicitement mais non disponible est refusé (400).
    const wanted = requested?.length
      ? requested
      : LEVEL_CONFIG[level].channels.filter((c) => AVAILABLE_CHANNELS.includes(c));
    const unknown = wanted.filter((c) => !AVAILABLE_CHANNELS.includes(c));
    if (unknown.length) {
      throw new BadRequestException(`Canal non disponible : ${unknown.join(', ')} (disponibles : ${AVAILABLE_CHANNELS.join(', ')})`);
    }
    const messaging = wanted.filter((c) => c !== 'app');
    const active: string[] = [];
    for (const c of messaging) if (await this.flags.isEnabled(c)) active.push(c);
    if (messaging.length && !active.length) {
      throw new ConflictException('Aucun des canaux de messagerie demandés n\'est activé');
    }
    return [...(wanted.includes('app') ? ['app'] : []), ...active];
  }

  /**
   * Crée l'intention de diffusion DANS la transaction de la décision, avec le
   * texte exact par langue figé maintenant (audit F04, F23).
   */
  private async createIntent(tx: Prisma.TransactionClient, p: {
    alert: { id: string; title: string; description: string; type: string; alertLevel: AlertLevel; zoneId: string };
    authorId: string; kind: BroadcastKind; certainty: BroadcastCertainty;
    level?: AlertLevel; approvedText?: string; targetZoneIds?: string[]; channels: string[]; idempotencyKey?: string;
  }) {
    const targets = p.targetZoneIds?.length ? p.targetZoneIds : [p.alert.zoneId];
    const zones = await tx.zone.findMany({ where: { id: { in: targets } }, select: { id: true, name: true } });
    if (zones.length !== targets.length) throw new BadRequestException('Zone cible inconnue');
    const level = p.level ?? p.alert.alertLevel;
    const payload = buildFrozenPayload({
      level, certainty: p.certainty as Certainty, approvedText: p.approvedText,
      title: p.alert.title, description: p.alert.description, zoneNames: zones.map((z) => z.name), type: p.alert.type,
    });
    try {
      return await tx.broadcast.create({
        data: {
          alertId: p.alert.id, authorId: p.authorId, kind: p.kind, certainty: p.certainty, alertLevel: level,
          message: payload.fr, payload, targetZoneIds: targets, channels: p.channels,
          idempotencyKey: p.idempotencyKey || randomUUID(),
        },
      });
    } catch (e) {
      if ((e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        throw new ConflictException('Une diffusion de ce type existe déjà pour cette alerte');
      }
      throw e;
    }
  }

  /** Transition conditionnelle : échoue (409) si l'alerte a changé entre la lecture et l'écriture (audit F17). */
  private async transition(tx: Prisma.TransactionClient, alertId: string, expected: Prisma.AlertWhereInput, data: Prisma.AlertUncheckedUpdateManyInput) {
    const { count } = await tx.alert.updateMany({ where: { id: alertId, broadcastAt: null, ...expected }, data });
    if (count !== 1) throw new ConflictException('L\'alerte a été modifiée entre-temps — rechargez avant de décider');
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

  /**
   * Recoupement à la sélection d'une alerte par la mairie.
   *
   * Renvoie deux signaux d'aide à la décision :
   *   1. Signalements citoyens géographiquement proches dans une fenêtre
   *      temporelle récente (cluster potentiel)
   *   2. Données OMVS (niveau du fleuve à Matam) si pertinent pour le type
   *      d'alerte — actuellement mockées, à brancher sur portail-omvs.org
   *      ou l'API ANACIM en V2.
   *
   * Défauts : rayon 15 km · fenêtre 48 h (équilibre département/jour).
   */
  async getContext(id: string, opts?: { radiusKm?: number; windowHours?: number }) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      select: { id: true, type: true, latitude: true, longitude: true, zoneId: true, createdAt: true },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');

    const radiusKm = opts?.radiusKm ?? 15;
    const windowHours = opts?.windowHours ?? 48;

    let nearbySignalements: any[] = [];
    if (alert.latitude !== null && alert.longitude !== null) {
      const since = new Date(Date.now() - windowHours * 3_600_000);
      const candidates = await this.prisma.signalement.findMany({
        where: {
          createdAt: { gte: since },
          latitude: { not: null },
          longitude: { not: null },
          // Exclure les signalements déjà liés à cette alerte
          NOT: { alertId: id },
        },
        take: 200,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, phone: true } } },
      });
      nearbySignalements = candidates
        .map((s) => ({
          id: s.id,
          type: s.type,
          text: s.text,
          severity: s.severity,
          status: s.status,
          createdAt: s.createdAt,
          channel: s.channel,
          user: s.user ? { name: s.user.name } : null,
          distanceKm: +haversineKm(alert.latitude!, alert.longitude!, s.latitude!, s.longitude!).toFixed(2),
        }))
        .filter((s) => s.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 10);
    }

    return {
      radiusKm,
      windowHours,
      generatedAt: new Date().toISOString(),
      nearbySignalements,
      cluster: nearbySignalements.length >= 2,
      omvs: buildMockOmvsData(alert.type),
    };
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
    const root = await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!root) throw new BadRequestException('Aucune zone configurée — contactez l\'administrateur');
    return root.id;
  }

  /**
   * Création d'une alerte (et de son signalement d'origine) : une seule
   * transaction, notification interne des opérateurs incluse (audit F17, F23).
   */
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
    opts?: { linkSignalementId?: string; tx?: Prisma.TransactionClient },
  ) {
    const level: AlertLevel = dto.alertLevel || AlertLevel.BLEU;
    let currentStep: AlertStep = AlertStep.SIGNALEMENT;
    let status: AlertStatus = AlertStatus.PENDING;
    if (creatorRole === Role.PROTECTION_CIVILE || creatorRole === Role.ADMIN || creatorRole === Role.SUPER_ADMIN) {
      ({ step: currentStep, status } = protectionCivileEntryStep(level));
    } else if (creatorRole === Role.HYDRO_METEO) {
      currentStep = AlertStep.PREFECTURE; // données techniques : entrée en phase CONFIRMÉE
      status = AlertStatus.VALIDATED;
    }
    const zoneId = await this.resolveZoneId(dto.zoneId, userId);

    const run = async (tx: Prisma.TransactionClient) => {
      const alert = await tx.alert.create({
        data: {
          title: dto.title, description: dto.description, type: dto.type, alertLevel: level,
          severity: dto.severity || 1, status, currentStep, zoneId,
          municipalityId: dto.municipalityId, createdById: userId,
          latitude: dto.latitude, longitude: dto.longitude, mediaUrls: dto.mediaUrls || [],
          requiresMedicalReview: dto.type === 'EPIDEMIE',
          ...(status === AlertStatus.VALIDATED ? { verifiedAt: new Date() } : {}),
        },
        include: { zone: { select: { name: true } }, municipality: { select: { name: true } } },
      });
      if (opts?.linkSignalementId) {
        await tx.signalement.update({ where: { id: opts.linkSignalementId }, data: { alertId: alert.id } });
      } else {
        await tx.signalement.create({
          data: {
            userId, alertId: alert.id, type: dto.type, text: dto.description,
            mediaUrls: dto.mediaUrls || [], latitude: dto.latitude, longitude: dto.longitude,
            channel: dto.channel || 'app',
          },
        });
      }
      const intent = await this.createIntent(tx, {
        alert, authorId: userId, kind: BroadcastKind.INTERNAL, certainty: BroadcastCertainty.INTERNAL,
        channels: ['whatsapp', 'sms'],
      });
      return { alert, intent };
    };

    const { alert, intent } = opts?.tx ? await run(opts.tx) : await this.prisma.$transaction(run);
    if (!opts?.tx) await this.afterCommit([intent.id], alert);
    return Object.assign(alert, { _intentId: intent.id });
  }

  async advance(
    alertId: string,
    validator: OperatorCtx,
    body: {
      action: ValidationAction;
      alertLevel?: AlertLevel;
      comment?: string; photoUrl?: string;
      latitude?: number; longitude?: number;
      gravity?: number;
    },
  ) {
    const { alert, facts } = await this.loadFacts(alertId);
    await this.assertTerritory(validator, alert.zoneId);
    this.deny(refuseAdvance(facts, validator, body.action, body.alertLevel), validator, alertId, 'alert.advance');

    const phase = normalizePhase(alert.currentStep);
    if (phase === PHASE.RECEPTION && body.action !== ValidationAction.REJECTED) {
      // Preuve de vérification terrain : jamais de coordonnées substituées (audit F18)
      if (body.latitude == null || body.longitude == null) throw new BadRequestException('Position GPS obligatoire');
      const images = [body.photoUrl, ...(alert.mediaUrls || [])].filter((u): u is string => !!u && isImageUrl(u));
      if (!images.length) throw new BadRequestException('Photo de preuve obligatoire (un vocal ne suffit pas)');
      if (body.gravity == null || body.gravity < 0 || body.gravity > 3) throw new BadRequestException('Niveau de gravité (0-3) obligatoire');
    }

    const effectiveLevel = body.alertLevel || alert.alertLevel;
    const data: Prisma.AlertUncheckedUpdateManyInput = {};
    let willDiffuse = false;
    if (body.action === ValidationAction.REJECTED) {
      data.status = AlertStatus.REJECTED;
      data.resolvedAt = new Date();
    } else {
      const next = nextStepFor(alert.currentStep, routingLevel(alert.alertLevel, body.alertLevel));
      if (!next) throw new ForbiddenException('Aucune transition possible');
      data.currentStep = next;
      data.status = AlertStatus.VALIDATED;
      if (phase === PHASE.RECEPTION) data.verifiedAt = new Date();
      if (body.gravity != null) data.severity = Math.max(1, body.gravity);
      willDiffuse = next === PHASE.DIFFUSEE;
      if (willDiffuse) Object.assign(data, { status: AlertStatus.BROADCAST, broadcastAt: new Date(), criticalValidated: true });
    }
    if (effectiveLevel !== alert.alertLevel) data.alertLevel = effectiveLevel;

    const prealertOn = !willDiffuse && body.action !== ValidationAction.REJECTED && await this.flags.isEnabled(FLAG_PREALERT);
    const intents: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, alertId, { status: alert.status, currentStep: alert.currentStep }, data);
      await tx.validation.create({
        data: {
          alertId, validatorId: validator.id, approved: body.action !== ValidationAction.REJECTED,
          action: body.action, step: alert.currentStep, comment: body.comment, photoUrl: body.photoUrl,
          latitude: body.latitude, longitude: body.longitude, gravity: body.gravity,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: validator.id, action: `alert.${body.action.toLowerCase()}`, resource: 'alert', resourceId: alertId,
          details: { step: alert.currentStep, action: body.action, gravity: body.gravity, alertLevel: effectiveLevel, diffused: willDiffuse },
        },
      });
      const fresh = { ...alert, alertLevel: effectiveLevel };
      if (willDiffuse) {
        const channels = await this.resolveChannels(undefined, effectiveLevel);
        intents.push((await this.createIntent(tx, {
          alert: fresh, authorId: validator.id, kind: BroadcastKind.PRIMARY, certainty: BroadcastCertainty.CONFIRMED, channels,
        })).id);
      } else if (prealertOn && prealertEligible({ ...facts, status: AlertStatus.VALIDATED, currentStep: data.currentStep as AlertStep, alertLevel: effectiveLevel })
        && !alert.citizensNotifiedAt) {
        // Pré-alerte (indicateur activé) : texte explicitement provisoire (audit F04)
        const channels = await this.resolveChannels(undefined, effectiveLevel);
        intents.push((await this.createIntent(tx, {
          alert: fresh, authorId: validator.id, kind: BroadcastKind.PREALERT, certainty: BroadcastCertainty.PREALERT, channels,
        })).id);
        await tx.alert.update({ where: { id: alertId }, data: { citizensNotifiedAt: new Date() } });
      }
    });

    await this.afterCommit(intents, alert);
    return this.findOne(alertId);
  }

  /**
   * Bypass d'urgence : court-circuit encadré (audit F05). Message marqué
   * « vérification en cours », revue a posteriori obligatoire.
   */
  async emergencyBypass(alertId: string, user: OperatorCtx, body: { justification: string; message?: string; channels?: string[] }) {
    const { alert, facts } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    this.deny(refuseBypass(facts, user, body.justification), user, alertId, 'alert.emergency_bypass');
    const channels = await this.resolveChannels(body.channels, alert.alertLevel);

    let intentId = '';
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, alertId, { status: { in: [AlertStatus.PENDING, AlertStatus.UNDER_REVIEW, AlertStatus.VALIDATED] } }, {
        status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(),
        emergencyBypass: true, bypassJustification: body.justification.trim(), bypassById: user.id,
      });
      intentId = (await this.createIntent(tx, {
        alert, authorId: user.id, kind: BroadcastKind.PRIMARY, certainty: BroadcastCertainty.EMERGENCY_BYPASS,
        approvedText: body.message, channels,
      })).id;
      await tx.auditLog.create({
        data: { userId: user.id, action: 'alert.emergency_bypass', resource: 'alert', resourceId: alertId, details: { justification: body.justification, channels, role: user.role, previousStatus: alert.status } },
      });
    });
    await this.afterCommit([intentId], alert);
    return this.findOne(alertId);
  }

  /** Revue a posteriori d'un bypass par une autorité distincte (PRÉFECTURE+). */
  async reviewBypass(alertId: string, user: OperatorCtx, note: string) {
    const { alert } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    if (!alert.emergencyBypass) throw new BadRequestException('Cette alerte n\'a pas fait l\'objet d\'une diffusion d\'urgence');
    if (alert.bypassReviewedAt) throw new ConflictException('Bypass déjà revu');
    if (!hasLevel(user.role, Role.PREFECTURE)) throw new ForbiddenException('Revue réservée à PREFECTURE ou supérieur');
    if (alert.bypassById === user.id) throw new ForbiddenException('La revue doit être faite par une autre personne que l\'auteur du bypass');
    if (!note || note.trim().length < 10) throw new BadRequestException('Note de revue (≥ 10 caractères) obligatoire');
    await this.prisma.$transaction([
      this.prisma.alert.update({ where: { id: alertId }, data: { bypassReviewedAt: new Date(), bypassReviewedById: user.id, bypassReviewNote: note.trim() } }),
      this.prisma.auditLog.create({ data: { userId: user.id, action: 'alert.bypass_review', resource: 'alert', resourceId: alertId, details: { note } } }),
    ]);
    return this.findOne(alertId);
  }

  /**
   * Auto-escalade (indicateur désactivé par défaut, décision D3) : une alerte
   * ROUGE+ vérifiée, toujours ouverte et non rejetée, non confirmée dans le
   * délai, part avec la mention « non confirmée par l'autorité ».
   * La transition est conditionnelle : jamais deux diffusions, jamais une
   * alerte rejetée, annulée ou clôturée (audit F03).
   */
  async autoEscalateStale(): Promise<number> {
    if (!(await this.flags.isEnabled(FLAG_AUTO_ESCALATION))) return 0;
    const cutoff = new Date(Date.now() - AUTO_ESCALATION_MINUTES * 60 * 1000);
    const candidates = await this.prisma.alert.findMany({
      where: {
        status: AlertStatus.VALIDATED, currentStep: PHASE.VERIFIEE,
        alertLevel: { in: [AlertLevel.ROUGE, AlertLevel.ROUGE_FONCE] },
        broadcastAt: null, requiresMedicalReview: false, verifiedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of candidates) {
      const { alert, facts } = await this.loadFacts(id);
      if (!autoEscalationEligible(facts)) continue;
      const lastValidator = alert.validations.filter((v) => v.approved).pop()?.validatorId ?? alert.createdById;
      try {
        let intentId = '';
        const channels = await this.resolveChannels(undefined, alert.alertLevel);
        await this.prisma.$transaction(async (tx) => {
          await this.transition(tx, id, { status: AlertStatus.VALIDATED, currentStep: PHASE.VERIFIEE, requiresMedicalReview: false }, {
            status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(), autoEscalated: true,
          });
          intentId = (await this.createIntent(tx, {
            alert, authorId: lastValidator, kind: BroadcastKind.PRIMARY, certainty: BroadcastCertainty.UNCONFIRMED_AUTO, channels,
          })).id;
          await tx.auditLog.create({
            data: { action: 'alert.auto_escalated', resource: 'alert', resourceId: id, details: { reason: `non confirmée après ${AUTO_ESCALATION_MINUTES} min`, level: alert.alertLevel, verifiedBy: lastValidator } },
          });
        });
        await this.afterCommit([intentId], alert);
        n++;
      } catch (e) {
        if (!(e instanceof ConflictException)) this.logger.error(`Auto-escalade ${id} : ${(e as Error).message}`);
      }
    }
    if (n) this.logger.warn(`Auto-escalade : ${n} alerte(s) diffusée(s) sans confirmation de l'autorité`);
    return n;
  }

  /** Diffusion directe : texte approuvé, zones et canaux choisis exécutés tels quels (audit F04, F05). */
  async broadcast(
    alertId: string,
    user: OperatorCtx,
    dto: { message?: string; targetZoneIds?: string[]; channels?: string[]; idempotencyKey?: string },
  ) {
    if (dto.idempotencyKey) {
      const replay = await this.prisma.broadcast.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) {
        if (replay.alertId !== alertId) throw new ConflictException('Clé d\'idempotence déjà utilisée pour une autre alerte');
        return { alert: await this.findOne(alertId), broadcast: replay, replayed: true };
      }
    }
    const { alert, facts } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    this.deny(refuseBroadcast(facts, user), user, alertId, 'alert.broadcast');
    const targets = dto.targetZoneIds?.length ? dto.targetZoneIds : [alert.zoneId];
    for (const z of targets) {
      if (!TERRITORY_EXEMPT.includes(user.role) && !(await this.territory.isWithin(z, user.zoneId))) {
        throw new ForbiddenException('Zone cible hors de votre territoire');
      }
    }
    const channels = await this.resolveChannels(dto.channels, alert.alertLevel);

    let broadcastRecord: any;
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, alertId, { status: AlertStatus.VALIDATED, requiresMedicalReview: false }, {
        status: AlertStatus.BROADCAST, currentStep: PHASE.DIFFUSEE, broadcastAt: new Date(), criticalValidated: true,
      });
      broadcastRecord = await this.createIntent(tx, {
        alert, authorId: user.id, kind: BroadcastKind.PRIMARY, certainty: BroadcastCertainty.CONFIRMED,
        approvedText: dto.message, targetZoneIds: targets, channels, idempotencyKey: dto.idempotencyKey,
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'alert.broadcast', resource: 'alert', resourceId: alertId, details: { alertLevel: alert.alertLevel, channels, targetZoneIds: targets, broadcastId: broadcastRecord.id } },
      });
    });
    await this.afterCommit([broadcastRecord.id], alert);
    return { alert: await this.findOne(alertId), broadcast: broadcastRecord };
  }

  async close(alertId: string, user: OperatorCtx, reason: string) {
    const { alert } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    if (!canClose(user.role)) throw new ForbiddenException('Rôle insuffisant pour clôturer');
    if (alert.status !== AlertStatus.BROADCAST) {
      throw new ForbiddenException(`Seule une alerte diffusée peut être clôturée (statut actuel : ${alert.status})`);
    }
    if (!reason || reason.trim().length < 3) throw new BadRequestException('Raison de clôture obligatoire (3 caractères minimum)');
    const { count } = await this.prisma.alert.updateMany({
      where: { id: alertId, status: AlertStatus.BROADCAST },
      data: { status: AlertStatus.CLOSED, currentStep: AlertStep.CLOSED, closedAt: new Date(), closureReason: reason, resolvedAt: new Date() },
    });
    if (count !== 1) throw new ConflictException('L\'alerte a été modifiée entre-temps');
    this.audit.log({ userId: user.id, action: 'alert.close', resource: 'alert', resourceId: alertId, details: { reason } });
    await this.afterCommit([], alert);
    return this.findOne(alertId);
  }

  /**
   * File de travail (audit F14) : alertes ouvertes du territoire sur
   * lesquelles l'utilisateur peut RÉELLEMENT agir selon alert-policy — la
   * même règle que celle appliquée par l'API, donc jamais de désaccord.
   */
  async getQueue(user: OperatorCtx) {
    const scope = TERRITORY_EXEMPT.includes(user.role) || !user.zoneId ? undefined : await this.territory.subtree(user.zoneId);
    const zoneFilter = scope ? { zoneId: { in: scope } } : {};
    const include = { zone: { select: { name: true, code: true } }, municipality: { select: { name: true } }, validations: { select: { validatorId: true, approved: true } } };
    const order: Prisma.AlertOrderByWithRelationInput[] = [{ alertLevel: 'desc' }, { severity: 'desc' }, { createdAt: 'asc' }];

    if (user.role === Role.RADIO_COMMUNAUTAIRE) {
      return this.prisma.alert.findMany({ where: { ...zoneFilter, status: { in: DIFFUSED_STATUSES } }, orderBy: order, include, take: 50 });
    }
    const open = await this.prisma.alert.findMany({
      where: { ...zoneFilter, status: { notIn: [...TERMINAL_STATUSES, ...DIFFUSED_STATUSES] }, broadcastAt: null },
      orderBy: order, include, take: 200,
    });
    const actionable = open.filter((a) => {
      const facts: AlertFacts = {
        status: a.status, currentStep: a.currentStep, alertLevel: a.alertLevel, broadcastAt: a.broadcastAt,
        requiresMedicalReview: a.requiresMedicalReview, createdById: a.createdById,
        priorValidatorIds: a.validations.filter((v) => v.approved).map((v) => v.validatorId),
      };
      return refuseAdvance(facts, user, ValidationAction.VALIDATED) === null || refuseBroadcast(facts, user) === null;
    });
    // Bypass à revoir a posteriori (PRÉFECTURE+)
    const reviews = hasLevel(user.role, Role.PREFECTURE)
      ? await this.prisma.alert.findMany({ where: { ...zoneFilter, emergencyBypass: true, bypassReviewedAt: null, NOT: { bypassById: user.id } }, include, take: 50 })
      : [];
    return [...actionable.slice(0, 50), ...reviews];
  }

  async medicalClearance(alertId: string, user: OperatorCtx) {
    // Autorité habilitée à lever la revue médicale : décision D1 (défaut : PROTECTION_CIVILE)
    if (user.role !== Role.PROTECTION_CIVILE && user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Seule la Protection Civile peut lever le blocage médical');
    }
    const { alert } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    if (!alert.requiresMedicalReview) throw new BadRequestException('Aucun blocage médical actif sur cette alerte');
    await this.prisma.alert.update({ where: { id: alertId }, data: { requiresMedicalReview: false } });
    this.audit.log({ userId: user.id, action: 'alert.medical_clearance', resource: 'alert', resourceId: alertId, details: {} });
    await this.afterCommit([], alert);
    return this.findOne(alertId);
  }

  /**
   * Alertes publiques en vigueur pour une zone (consultation citoyenne
   * USSD / WhatsApp — audit F16) : alertes diffusées vers cette zone, une
   * zone parente ou une zone qu'elle contient. Sans zone connue : toute la
   * région. Informations publiques uniquement.
   */
  async publicActiveFor(zoneId?: string | null, take = 5) {
    const root = zoneId ?? (await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    const zones = root
      ? [...new Set([...(await this.territory.ancestorsInclusive(root)), ...(await this.territory.subtree(root))])]
      : [];
    const alerts = await this.prisma.alert.findMany({
      where: {
        status: { in: PUBLIC_ACTIVE_STATUSES },
        ...(zones.length ? {
          OR: [
            { zoneId: { in: zones } },
            { broadcasts: { some: { kind: BroadcastKind.PRIMARY, targetZoneIds: { hasSome: zones } } } },
          ],
        } : {}),
      },
      orderBy: [{ alertLevel: 'desc' }, { broadcastAt: 'desc' }],
      take,
      include: { zone: { select: { name: true } } },
    });
    return alerts.map((a) => ({
      id: a.id, title: a.title, alertLevel: a.alertLevel, status: a.status, type: a.type,
      zone: a.zone ? { name: a.zone.name } : null, broadcastAt: a.broadcastAt, createdAt: a.createdAt,
    }));
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

/** Une preuve photo doit être une image (pas un vocal) — audit F18. */
function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|heic|gif)(\?|$)/i.test(url);
}

/** Distance grand cercle (Haversine) entre deux points GPS, en km. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // rayon terrestre moyen, km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Mock OMVS — à brancher en V2 sur l'API portail-omvs.org ou ANACIM.
 * Renvoie des valeurs plausibles selon la saison (hivernage juin-octobre).
 * Seuils Matam : alerte 5,20 m · danger 5,80 m (chiffres ordres de grandeur).
 */
function buildMockOmvsData(alertType: AlertType) {
  const month = new Date().getMonth();
  const isHivernage = month >= 5 && month <= 9;
  const baseLevel = isHivernage ? 4.5 : 2.4;
  // Variation pseudo-aléatoire reproductible (basée sur le jour)
  const day = new Date().getDate();
  const variance = ((day % 7) - 3) * 0.15;
  const level = +(baseLevel + variance).toFixed(2);

  const ALERT_THRESHOLD = 5.2;
  const DANGER_THRESHOLD = 5.8;

  let status: 'normal' | 'vigilance' | 'alerte' | 'danger' = 'normal';
  if (level >= DANGER_THRESHOLD) status = 'danger';
  else if (level >= ALERT_THRESHOLD) status = 'alerte';
  else if (level >= ALERT_THRESHOLD - 0.3) status = 'vigilance';

  // OMVS pertinent uniquement pour les risques hydrométéo
  const relevant = ['INONDATION', 'SECHERESSE'].includes(alertType);

  return {
    relevant,
    mock: true, // à retirer quand l'API réelle sera branchée
    source: 'OMVS — Organisation pour la Mise en Valeur du fleuve Sénégal',
    fetchedAt: new Date().toISOString(),
    station: 'Matam',
    riverLevelMeters: level,
    alertThresholdMeters: ALERT_THRESHOLD,
    dangerThresholdMeters: DANGER_THRESHOLD,
    status,
    flowRateM3s: +(280 + variance * 100).toFixed(0),
    notice: 'Données simulées — branchement portail-omvs.org prévu en V2',
  };
}
