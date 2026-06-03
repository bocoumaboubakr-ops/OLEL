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

    const [items, total] = await Promise.all([
      this.prisma.signalement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, phone: true } } },
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

  async createFromBot(dto: any, botUserId: string) {
    return this.prisma.signalement.create({
      data: {
        userId: botUserId,
        type: dto.type,
        text: dto.text,
        mediaUrls: dto.mediaUrls || [],
        latitude: dto.latitude,
        longitude: dto.longitude,
        channel: dto.channel || 'bot',
      },
    });
  }

  async updateStatus(id: string, status: SignalementStatus, reviewerId: string) {
    const existing = await this.prisma.signalement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Signalement ${id} introuvable`);

    return this.prisma.signalement.update({
      where: { id },
      data: { status },
    });
  }
}
