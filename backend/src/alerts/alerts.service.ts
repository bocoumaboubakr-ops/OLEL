import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, GoneException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AlertLevel, AlertStatus, AlertStep, AlertType, BroadcastCertainty, BroadcastKind,
  CriticalValidatorCategory, LocationSource, Prisma, Role, ValidationAction,
} from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';
import {
  LEVEL_CONFIG, CRITICAL_LEVELS, canClose,
  protectionCivileEntryStep, normalizePhase, nextStepFor, PHASE,
  AUTO_ESCALATION_MINUTES, hasLevel, levelFromDeclaredSeverity,
} from './alert-workflow';
import {
  AlertFacts, refuseAdvance, refuseBroadcast, refuseBypass, autoEscalationEligible,
  prealertEligible, routingLevel, TERMINAL_STATUSES, DIFFUSED_STATUSES, PUBLIC_ACTIVE_STATUSES,
  MIN_BYPASS_JUSTIFICATION, refuseCorrection, refuseRetraction, MIN_RETRACTION_REASON,
} from './alert-policy';
import { AuditService } from '../audit/audit.service';
import { TerritoryService } from '../common/territory/territory.service';
import { BroadcastDispatcher } from '../notifications/broadcast-dispatcher.service';
import { FlagsService } from '../flags/flags.service';
import { buildFrozenPayload, buildTemplateCalls, Certainty } from '../common/i18n/alert-messages';
import { TERRITORY_EXEMPT } from '../users/user-policy';
import { randomUUID } from 'crypto';
import { pilotAudienceAllowed } from '../common/pilot/pilot-mode';

/** Canaux acceptés pour une diffusion : ceux réellement mis en œuvre (audit F26). */
export const AVAILABLE_CHANNELS = ['app', 'whatsapp', 'sms'];

/** Indicateurs opérationnels : automatismes de diffusion désactivés par défaut (décision D3). */
export const FLAG_PREALERT = 'prealert_red';
export const FLAG_AUTO_ESCALATION = 'auto_escalation_red';

type OperatorCtx = { id: string; role: Role; zoneId?: string | null; phone?: string | null };
export type ReaderCtx = OperatorCtx;

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
    sequence?: number;
  }) {
    const targets = p.targetZoneIds?.length ? p.targetZoneIds : [p.alert.zoneId];
    const zones = await tx.zone.findMany({ where: { id: { in: targets } }, select: { id: true, name: true } });
    if (zones.length !== targets.length) throw new BadRequestException('Zone cible inconnue');
    const level = p.level ?? p.alert.alertLevel;
    const input = {
      level, certainty: p.certainty as Certainty, approvedText: p.approvedText,
      title: p.alert.title, description: p.alert.description, zoneNames: zones.map((z) => z.name), type: p.alert.type,
    };
    const templates = buildTemplateCalls(input);
    // Texte libre par langue + appels de modèles figés : ce qui part est ce qui a été approuvé
    const payload = { ...buildFrozenPayload(input), ...(templates ? { templates } : {}) };
    try {
      return await tx.broadcast.create({
        data: {
          alertId: p.alert.id, authorId: p.authorId, kind: p.kind, certainty: p.certainty, alertLevel: level, sequence: p.sequence ?? 0,
          message: payload.fr, payload: payload as unknown as Prisma.InputJsonObject, targetZoneIds: targets, channels: p.channels,
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

  // ── Lecture cloisonnée (audit F08) ─────────────────────────────────────
  /**
   * Périmètre de lecture des alertes, appliqué à CHAQUE lecture :
   *  - administration : tout ;
   *  - opérateur : alertes dont la zone est dans son territoire (sous-arbre) ;
   *  - radio : alertes diffusées de son territoire ;
   *  - citoyen : ses propres signalements + alertes publiques en vigueur
   *    concernant sa zone (même définition que USSD/WhatsApp).
   * En mode pilote, citoyens et radios hors liste autorisée ne voient aucune
   * alerte diffusée (le citoyen garde l'accès à ses propres signalements).
   */
  private async readScope(user: ReaderCtx): Promise<Prisma.AlertWhereInput> {
    if (TERRITORY_EXEMPT.includes(user.role)) return {};
    if (user.role === Role.CITOYEN) {
      if (!pilotAudienceAllowed(user.phone)) return { createdById: user.id };
      const zones = await this.publicZonesFor(user.zoneId);
      return {
        OR: [
          { createdById: user.id },
          {
            status: { in: PUBLIC_ACTIVE_STATUSES },
            ...(zones.length ? { OR: [{ zoneId: { in: zones } }, { broadcasts: { some: { kind: BroadcastKind.PRIMARY, targetZoneIds: { hasSome: zones } } } }] } : {}),
          },
        ],
      };
    }
    if (!user.zoneId) return { id: { in: [] } };
    const territory = await this.territory.subtree(user.zoneId);
    if (user.role === Role.RADIO_COMMUNAUTAIRE) {
      if (!pilotAudienceAllowed(user.phone)) return { id: { in: [] } };
      return { zoneId: { in: territory }, status: { in: PUBLIC_ACTIVE_STATUSES } };
    }
    return { zoneId: { in: territory } };
  }

  /** Zones dont les alertes publiques concernent un citoyen : ancêtres + descendants de sa zone. */
  private async publicZonesFor(zoneId?: string | null): Promise<string[]> {
    const root = zoneId ?? (await this.prisma.zone.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (!root) return [];
    return [...new Set([...(await this.territory.ancestorsInclusive(root)), ...(await this.territory.subtree(root))])];
  }

  private isOperator(user: ReaderCtx) {
    return user.role !== Role.CITOYEN && user.role !== Role.RADIO_COMMUNAUTAIRE;
  }

  /** 404 (et non 403) hors périmètre : on ne révèle pas l'existence d'une alerte. */
  private async assertReadable(alertId: string, user: ReaderCtx, operatorOnly = false) {
    if (operatorOnly && !this.isOperator(user)) throw new ForbiddenException('Réservé aux opérateurs');
    const found = await this.prisma.alert.findFirst({ where: { AND: [{ id: alertId }, await this.readScope(user)] }, select: { id: true } });
    if (!found) throw new NotFoundException('Alerte introuvable');
  }

  async getHistory(alertId: string, user: ReaderCtx) {
    await this.assertReadable(alertId, user, true);
    return this.prisma.validation.findMany({
      where: { alertId },
      orderBy: { createdAt: 'asc' },
      include: { validator: { select: { name: true, role: true } } },
    });
  }

  /** Historique des co-signatures (ancien circuit) : lecture seule, non bloquante. */
  async getCriticalValidationStatus(alertId: string, user: ReaderCtx) {
    await this.assertReadable(alertId, user, true);
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

  /**
   * Ancienne « triple validation » : n'est plus une règle du circuit (v3 :
   * vérification, confirmation par l'autorité pour ROUGE+, double regard).
   * L'enregistrer laisserait croire à un contrôle que l'API n'applique pas
   * (audit F14) : l'opération est retirée.
   */
  async addCriticalValidation(): Promise<never> {
    throw new GoneException('La triple validation n\'est plus une étape du circuit : utilisez Valider / Confirmer');
  }

  async findAll(filters: {
    zoneId?: string; status?: AlertStatus; type?: AlertType;
    step?: AlertStep; alertLevel?: AlertLevel; page?: number; limit?: number;
  }, user: ReaderCtx) {
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
    const scoped: Prisma.AlertWhereInput = { AND: [where, await this.readScope(user)] };

    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where: scoped,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          zone: { select: { name: true, code: true } },
          municipality: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.alert.count({ where: scoped }),
    ]);
    // « pilot_closed » : liste vide parce que le service est en essai, et non
    // parce qu'il n'y a pas d'alerte (l'application l'affiche ainsi).
    const consultation = this.isOperator(user) || pilotAudienceAllowed(user.phone) ? 'open' : 'pilot_closed';
    return { alerts: this.isOperator(user) ? alerts : alerts.map((a) => publicView(a, user)), total, page, limit, consultation };
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
  async getContext(id: string, user: ReaderCtx, opts?: { radiusKm?: number; windowHours?: number }) {
    await this.assertReadable(id, user, true);
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
      // Aucune source hydrométrique n'est connectée : aucune valeur n'est
      // fabriquée dans un panneau d'aide à la décision (audit F18/F35).
      omvs: hydrologyUnavailable(alert.type),
    };
  }

  /**
   * Détail d'une alerte pour un lecteur : périmètre vérifié, vue publique
   * pour citoyen/radio, et pour un opérateur les actions qu'il peut
   * réellement effectuer (calculées par alert-policy — audit F14).
   */
  async findOneFor(id: string, user: ReaderCtx) {
    await this.assertReadable(id, user);
    const alert = await this.findOne(id);
    if (!this.isOperator(user)) return publicView(alert, user);
    return { ...alert, actions: await this.actionsFor(id, user) };
  }

  /** Actions autorisées pour l'utilisateur, avec la raison d'un refus. */
  async actionsFor(alertId: string, user: OperatorCtx) {
    const { alert, facts } = await this.loadFacts(alertId);
    const inTerritory = TERRITORY_EXEMPT.includes(user.role) || (await this.territory.isWithin(alert.zoneId, user.zoneId));
    const r = (reason: string | null) => (inTerritory ? { allowed: !reason, reason: reason ?? undefined } : { allowed: false, reason: 'Hors de votre territoire' });
    const phase = normalizePhase(alert.currentStep);
    const next = nextStepFor(alert.currentStep, alert.alertLevel);
    return {
      validate: r(refuseAdvance(facts, user, ValidationAction.VALIDATED)),
      reject: r(refuseAdvance(facts, user, ValidationAction.REJECTED)),
      broadcast: r(refuseBroadcast(facts, user)),
      emergencyBypass: r(refuseBypass(facts, user, 'x'.repeat(MIN_BYPASS_JUSTIFICATION))),
      close: r(!canClose(user.role) ? 'Rôle insuffisant pour clôturer' : alert.status !== AlertStatus.BROADCAST ? 'Seule une alerte diffusée peut être clôturée' : null),
      medicalClearance: r(!alert.requiresMedicalReview ? 'Aucune revue médicale en attente'
        : (user.role !== Role.PROTECTION_CIVILE && !TERRITORY_EXEMPT.includes(user.role)) ? 'Réservé à la Protection Civile (décision D1)' : null),
      correction: r(refuseCorrection(facts, user)),
      retract: r(refuseRetraction(facts, user, 'x'.repeat(MIN_RETRACTION_REASON))),
      minRetractionReason: MIN_RETRACTION_REASON,
      reviewBypass: r(!alert.emergencyBypass || alert.bypassReviewedAt ? 'Aucune diffusion d\'urgence à revoir'
        : !hasLevel(user.role, Role.PREFECTURE) ? 'Revue réservée à PREFECTURE ou supérieur'
        : alert.bypassById === user.id ? 'La revue doit être faite par une autre personne' : null),
      /** Étape RÉCEPTION : la validation exige une preuve terrain (GPS capturé + photo + gravité). */
      requiresFieldProof: phase === PHASE.RECEPTION,
      /** Effet d'une validation : étape suivante, et si elle déclenche la diffusion. */
      onValidate: next ? { nextStep: next, diffuses: next === PHASE.DIFFUSEE } : null,
      minBypassJustification: MIN_BYPASS_JUSTIFICATION,
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
      subtype?: string; locationSource?: LocationSource; clientRequestId?: string;
    },
    userId: string,
    creatorRole?: Role,
    opts?: { linkSignalementId?: string; tx?: Prisma.TransactionClient },
  ): Promise<any> {
    // Rejeu d'un envoi hors connexion : même requête client → même alerte (audit F15)
    const sourceRef = !opts?.linkSignalementId && dto.clientRequestId ? `app:${userId}:${dto.clientRequestId}` : undefined;
    if (sourceRef) {
      const prior = await this.prisma.signalement.findUnique({ where: { sourceRef }, select: { alertId: true } });
      if (prior?.alertId) return { ...(await this.findOne(prior.alertId)), duplicate: true };
    }
    // Citoyen / sentinelle : le niveau découle de la gravité déclarée (même règle
    // que WhatsApp/USSD) ; seul un opérateur propose un niveau officiel (audit F21).
    const declaredOnly = !creatorRole || creatorRole === Role.CITOYEN || creatorRole === Role.SENTINELLE;
    const level: AlertLevel = (!declaredOnly && dto.alertLevel) || levelFromDeclaredSeverity(dto.severity);
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
          subtype: dto.subtype, locationSource: dto.latitude != null ? dto.locationSource : undefined,
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
            channel: dto.channel || 'app', subtype: dto.subtype, sourceRef,
            locationSource: dto.latitude != null ? dto.locationSource : undefined,
          },
        });
      }
      const intent = await this.createIntent(tx, {
        alert, authorId: userId, kind: BroadcastKind.INTERNAL, certainty: BroadcastCertainty.INTERNAL,
        channels: ['whatsapp', 'sms'],
      });
      return { alert, intent };
    };

    let created: { alert: any; intent: { id: string } };
    try {
      created = opts?.tx ? await run(opts.tx) : await this.prisma.$transaction(run);
    } catch (e) {
      // Deux rejeux simultanés de la même requête client : renvoyer l'alerte déjà créée
      if (sourceRef && (e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        const prior = await this.prisma.signalement.findUnique({ where: { sourceRef }, select: { alertId: true } });
        if (prior?.alertId) return { ...(await this.findOne(prior.alertId)), duplicate: true };
      }
      throw e;
    }
    const { alert, intent } = created;
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
      locationSource?: LocationSource; locationAccuracyM?: number;
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
          // Provenance enregistrée telle que déclarée par l'appareil (audit F18)
          locationSource: body.latitude != null ? body.locationSource : undefined,
          locationAccuracyM: body.latitude != null ? body.locationAccuracyM : undefined,
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

  /**
   * Rectificatif d'une alerte diffusée (D11) : nouveau message approuvé, envoyé
   * aux mêmes zones et par les mêmes canaux que la diffusion principale,
   * marqué « RECTIFICATIF — remplace le message précédent ».
   */
  async correction(alertId: string, user: OperatorCtx, dto: { message: string; channels?: string[]; idempotencyKey?: string }) {
    if (dto.idempotencyKey) {
      const replay = await this.prisma.broadcast.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) return { alert: await this.findOne(alertId), broadcast: replay, replayed: true };
    }
    const { alert, facts } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    this.deny(refuseCorrection(facts, user), user, alertId, 'alert.correction');
    if (!dto.message?.trim()) throw new BadRequestException('Texte du rectificatif obligatoire');
    const primary = await this.prisma.broadcast.findFirst({ where: { alertId, kind: BroadcastKind.PRIMARY }, orderBy: { createdAt: 'asc' } });
    const targets = primary?.targetZoneIds?.length ? primary.targetZoneIds : [alert.zoneId];
    const channels = await this.resolveChannels(dto.channels?.length ? dto.channels : primary?.channels, alert.alertLevel);
    let record: any;
    await this.prisma.$transaction(async (tx) => {
      const sequence = (await tx.broadcast.count({ where: { alertId, kind: BroadcastKind.CORRECTION } })) + 1;
      record = await this.createIntent(tx, {
        alert, authorId: user.id, kind: BroadcastKind.CORRECTION, certainty: BroadcastCertainty.CORRECTION,
        approvedText: dto.message, targetZoneIds: targets, channels, idempotencyKey: dto.idempotencyKey, sequence,
      });
      await tx.auditLog.create({ data: { userId: user.id, action: 'alert.correction', resource: 'alert', resourceId: alertId, details: { broadcastId: record.id, sequence, channels, targetZoneIds: targets } } });
    });
    await this.afterCommit([record.id], alert);
    return { alert: await this.findOne(alertId), broadcast: record };
  }

  /**
   * Retrait d'une alerte diffusée (fausse alerte, D11) : l'alerte passe
   * CANCELLED (elle disparaît des alertes en vigueur), un message « ALERTE
   * ANNULÉE » part vers les mêmes destinataires, motif tracé.
   */
  async retract(alertId: string, user: OperatorCtx, dto: { reason: string; message?: string }) {
    const { alert, facts } = await this.loadFacts(alertId);
    await this.assertTerritory(user, alert.zoneId);
    this.deny(refuseRetraction(facts, user, dto.reason), user, alertId, 'alert.retract');
    const primary = await this.prisma.broadcast.findFirst({ where: { alertId, kind: BroadcastKind.PRIMARY }, orderBy: { createdAt: 'asc' } });
    const targets = primary?.targetZoneIds?.length ? primary.targetZoneIds : [alert.zoneId];
    const channels = await this.resolveChannels(primary?.channels, alert.alertLevel);
    // Texte par défaut sans traduction automatique (relecture D5)
    const text = dto.message?.trim() || `L'alerte « ${alert.title} » est annulée. Les consignes précédentes ne s'appliquent plus.`;
    let record: any;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, status: { in: DIFFUSED_STATUSES }, retractedAt: null },
        data: { status: AlertStatus.CANCELLED, retractedAt: new Date(), retractedById: user.id, retractionReason: dto.reason.trim(), closedAt: new Date(), closureReason: `Retrait : ${dto.reason.trim()}` },
      });
      if (count !== 1) throw new ConflictException('L\'alerte a été modifiée entre-temps — rechargez avant de décider');
      record = await this.createIntent(tx, {
        alert, authorId: user.id, kind: BroadcastKind.RETRACTION, certainty: BroadcastCertainty.RETRACTION,
        approvedText: text, targetZoneIds: targets, channels,
      });
      await tx.auditLog.create({ data: { userId: user.id, action: 'alert.retract', resource: 'alert', resourceId: alertId, details: { reason: dto.reason.trim(), broadcastId: record.id } } });
    });
    await this.afterCommit([record.id], alert);
    return { alert: await this.findOne(alertId), broadcast: record };
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

  /**
   * Diffusions d'une alerte avec leur suivi par canal (envoyé ≠ livré ≠ lu ≠
   * échec) — opérateurs du territoire seulement.
   */
  async broadcastsOf(alertId: string, user: ReaderCtx) {
    await this.assertReadable(alertId, user, true);
    const rows = await this.prisma.broadcast.findMany({
      where: { alertId }, orderBy: [{ createdAt: 'asc' }],
      include: { author: { select: { name: true, role: true } } },
    });
    const groups = rows.length ? await this.prisma.broadcastDelivery.groupBy({
      by: ['broadcastId', 'channel', 'status'], where: { broadcastId: { in: rows.map((b) => b.id) } }, _count: true,
    }) : [];
    return rows.map((b) => {
      const byChannel: Record<string, Record<string, number>> = {};
      for (const g of groups.filter((x) => x.broadcastId === b.id)) {
        (byChannel[g.channel] ??= {})[g.status] = g._count;
      }
      return {
        id: b.id, kind: b.kind, certainty: b.certainty, sequence: b.sequence, status: b.status,
        message: b.message, channels: b.channels, targetZoneIds: b.targetZoneIds,
        totalRecipients: b.totalRecipients, sentCount: b.sentCount, deliveredCount: b.deliveredCount,
        failedCount: b.failedCount, simulatedCount: b.simulatedCount, lastError: b.lastError,
        createdAt: b.createdAt, completedAt: b.completedAt, author: b.author, byChannel,
      };
    });
  }

  /** Remises d'une diffusion, numéros masqués (minimisation). */
  async deliveriesOf(broadcastId: string, user: ReaderCtx, page = 1, limit = 50) {
    const b = await this.prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { alertId: true } });
    if (!b) throw new NotFoundException('Diffusion introuvable');
    await this.assertReadable(b.alertId, user, true);
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.broadcastDelivery.findMany({ where: { broadcastId }, orderBy: [{ recipient: 'asc' }, { channel: 'asc' }], skip, take }),
      this.prisma.broadcastDelivery.count({ where: { broadcastId } }),
    ]);
    const mask = (p: string) => (p.length > 8 ? `${p.slice(0, 6)}****${p.slice(-2)}` : '****');
    return {
      total,
      items: rows.map((d) => ({
        recipient: mask(d.recipient), channel: d.channel, lang: d.lang, status: d.status, error: d.error,
        attempts: d.attempts, updatedAt: d.updatedAt, deliveredAt: d.deliveredAt, readAt: d.readAt,
      })),
    };
  }

  async getBroadcasts(user: ReaderCtx, alertId?: string) {
    const scope = await this.readScope(user);
    return this.prisma.broadcast.findMany({
      where: { ...(alertId ? { alertId } : {}), alert: scope },
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
 * Panneau hydrologie : aucune source (OMVS, ANACIM, DGPRE) n'est connectée.
 * On l'indique explicitement plutôt que d'afficher des valeurs simulées.
 */
function hydrologyUnavailable(alertType: AlertType) {
  return {
    relevant: ['INONDATION', 'SECHERESSE'].includes(alertType),
    available: false,
    notice: 'Aucune source hydrométrique connectée (OMVS/ANACIM non intégrés) — ne pas utiliser pour décider.',
  };
}

/**
 * Vue publique d'une alerte (citoyen, radio) : ni validations, ni identité des
 * signaleurs, ni signalements liés. Les médias et la position précise ne sont
 * visibles que par l'auteur du signalement.
 */
function publicView(a: any, user: ReaderCtx) {
  const own = a.createdById === user.id;
  return {
    id: a.id, title: a.title, description: a.description, type: a.type,
    alertLevel: a.alertLevel, severity: a.severity, status: a.status, currentStep: a.currentStep,
    zoneId: a.zoneId, zone: a.zone ? { name: a.zone.name } : null,
    broadcastAt: a.broadcastAt, closedAt: a.closedAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
    ...(own ? { mediaUrls: a.mediaUrls, latitude: a.latitude, longitude: a.longitude, mine: true } : {}),
  };
}
