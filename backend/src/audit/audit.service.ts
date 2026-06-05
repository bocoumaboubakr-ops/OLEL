import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: { userId?: string; action: string; resource: string; resourceId?: string; details?: any; ip?: string; userAgent?: string }) {
    try {
      return await this.prisma.auditLog.create({ data: entry });
    } catch { /* audit non bloquant */ }
  }

  findAll(filters: { userId?: string; resource?: string; page?: number; limit?: number }) {
    const { userId, resource, page = 1, limit = 50 } = filters;
    const where: any = {};
    if (userId) where.userId = userId;
    if (resource) where.resource = resource;

    return this.prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
