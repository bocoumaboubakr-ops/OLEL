import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SignalementStatus } from '@prisma/client';

@Injectable()
export class SignalementsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { page?: number; limit?: number; status?: SignalementStatus; zoneId?: string }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.zoneId) where.user = { zoneId: params.zoneId };

    const [items, total] = await Promise.all([
      this.prisma.signalement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, phone: true, zoneId: true } } },
      }),
      this.prisma.signalement.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create(dto: any, userId: string) {
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

  async createFromBot(dto: any) {
    const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
    const botUser = await this.prisma.user.findUnique({ where: { phone: botPhone } });
    if (!botUser) throw new Error(`Compte bot introuvable (${botPhone}). Vérifiez le seed.`);

    return this.prisma.signalement.create({
      data: {
        userId: botUser.id,
        type: dto.type,
        text: dto.description || dto.text || '',
        mediaUrls: dto.mediaUrls || [],
        latitude: dto.latitude,
        longitude: dto.longitude,
        channel: 'whatsapp',
      },
    });
  }

  async updateStatus(id: string, status: SignalementStatus, reviewerId: string) {
    const existing = await this.prisma.signalement.findUnique({ where: { id } });
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

    return updated;
  }
}
