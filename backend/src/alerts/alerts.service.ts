import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertStatus, AlertStep, AlertType, Role, ValidationAction } from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';
import { WORKFLOW, canAdvance, canBroadcast, canClose } from './alert-workflow';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    private gateway: AlertsGateway,
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

  async create(
    dto: { title: string; description: string; type: any; severity?: number; zoneId: string; latitude?: number; longitude?: number; mediaUrls?: string[] },
    userId: string,
    creatorRole?: Role,
  ) {
    // Cas spéciaux du cursus : origine officielle peut entrer plus haut dans la chaîne
    let currentStep: AlertStep = AlertStep.SIGNALEMENT;
    let status: AlertStatus = AlertStatus.PENDING;
    if (creatorRole === Role.PROTECTION_CIVILE) {
      // Origine officielle (centre de santé, etc.) → entre directement à PREFECTURE
      currentStep = AlertStep.PREFECTURE;
      status = AlertStatus.UNDER_REVIEW;
    }

    const alert = await this.prisma.alert.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        severity: dto.severity || 2,
        status,
        currentStep,
        zoneId: dto.zoneId,
        createdById: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mediaUrls: dto.mediaUrls || [],
        requiresMedicalReview: dto.type === 'EPIDEMIE',
      },
      include: { zone: { select: { name: true } } },
    });

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
    if ([AlertStatus.REJECTED, AlertStatus.CLOSED, AlertStatus.CANCELLED, AlertStatus.BROADCAST].includes(alert.status as any)) {
      throw new ForbiddenException('Alerte déjà clôturée ou diffusée');
    }
    if (alert.currentStep === AlertStep.BROADCAST || alert.currentStep === AlertStep.CLOSED) {
      throw new ForbiddenException('Cette étape ne se valide pas (diffusion/clôture dédiées)');
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

    await this.prisma.validation.create({
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
    });

    let data: any;
    if (body.action === ValidationAction.REJECTED) {
      data = { status: AlertStatus.REJECTED, resolvedAt: new Date() };
    } else {
      // VALIDATED ou ESCALATED → avance
      data = { currentStep: def.next, status: def.nextStatus };
      if (body.gravity != null) data.severity = Math.max(1, body.gravity);
      // ESCALATED : on saute directement à PREFECTURE si possible
      if (body.action === ValidationAction.ESCALATED) {
        data.currentStep = AlertStep.PREFECTURE;
        data.status = AlertStatus.VALIDATED;
      }
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data,
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    return updated;
  }

  /** Diffusion (préfecture+) : VALIDATED → BROADCASTING → BROADCAST. */
  async broadcast(alertId: string, user: { id: string; role: Role }) {
    const alert = await this.findOne(alertId);
    if (!canBroadcast(user.role)) {
      throw new ForbiddenException('Seule la préfecture (ou plus) peut diffuser');
    }
    if (alert.status !== AlertStatus.VALIDATED && alert.currentStep !== AlertStep.PREFECTURE) {
      throw new ForbiddenException('Alerte non validée — diffusion impossible');
    }
    if (alert.requiresMedicalReview && alert.status !== AlertStatus.VALIDATED) {
      throw new ForbiddenException('Validation médicale requise avant diffusion');
    }
    if (alert.requiresConsent && !alert.consentObtained) {
      throw new ForbiddenException('Consentement requis avant diffusion');
    }

    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.BROADCASTING, currentStep: AlertStep.BROADCAST },
    });

    await this.enqueueFanout({ alertId, isBroadcast: true });

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.BROADCAST, broadcastAt: new Date() },
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    return updated;
  }

  /** Clôture (mairie+) : BROADCAST → CLOSED, raison obligatoire. */
  async close(alertId: string, user: { id: string; role: Role }, reason: string) {
    const alert = await this.findOne(alertId);
    if (!canClose(user.role)) {
      throw new ForbiddenException('Rôle insuffisant pour clôturer');
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Raison de clôture obligatoire');
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.CLOSED, currentStep: AlertStep.CLOSED, closedAt: new Date(), closureReason: reason, resolvedAt: new Date() },
      include: { zone: { select: { name: true } } },
    });

    this.safeBroadcast(updated);
    return updated;
  }
}
