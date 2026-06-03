import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ZonesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.zone.findMany({
      where: { isActive: true },
      include: { _count: { select: { users: true, alerts: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        children: true,
        _count: { select: { users: true, alerts: true } },
      },
    });
    if (!zone) throw new NotFoundException('Zone introuvable');
    return zone;
  }

  create(dto: { name: string; code: string; region: string; latitude?: number; longitude?: number; radiusKm?: number; parentId?: string }) {
    return this.prisma.zone.create({ data: dto });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.prisma.zone.update({ where: { id }, data: dto });
  }
}
