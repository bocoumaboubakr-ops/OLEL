import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertStatus, AlertType, Role } from '@prisma/client';
import { AlertsGateway } from './alerts.gateway';

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    private gateway: AlertsGateway,
  ) {}

  async findAll(filters: { zoneId?: string; status?: AlertStatus; type?: AlertType; page?: number; limit?: number }) {
    const { zoneId, status, type, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (zoneId) where.zoneId = zoneId;
    if (status) where.status = status;
    if (type) where.type = type;

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
        validations: { include: { validator: { select: { name: true, role: true } } } },
      },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    return alert;
  }

  async create(dto: { title: string; description: string; type: any; severity?: number; zoneId: string; latitude?: number; longitude?: number; mediaUrls?: string[] }, userId: string) {
    const alert = await this.prisma.alert.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        severity: dto.severity || 2,
        zoneId: dto.zoneId,
        createdById: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mediaUrls: dto.mediaUrls || [],
      },
      include: { zone: { select: { name: true } } },
    });

    await this.notifQueue.add('fanout', { alertId: alert.id }, { attempts: 3, backoff: 5000 });
    this.gateway.broadcastAlert(alert);

    return alert;
  }

  async validate(alertId: string, validatorId: string, approved: boolean, comment?: string) {
    const alert = await this.findOne(alertId);
    if (alert.status !== AlertStatus.PENDING) {
      throw new ForbiddenException('Alerte déjà traitée');
    }

    await this.prisma.validation.upsert({
      where: { alertId_validatorId: { alertId, validatorId } },
      update: { approved, comment },
      create: { alertId, validatorId, approved, comment },
    });

    if (approved) {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: { status: AlertStatus.ACTIVE },
      });
      await this.notifQueue.add('fanout', { alertId, isValidated: true }, { attempts: 3, backoff: 5000 });
    } else {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: { status: AlertStatus.CANCELLED },
      });
    }

    return { success: true };
  }

  async resolve(id: string, userId: string) {
    await this.findOne(id);
    return this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() },
    });
  }
}
