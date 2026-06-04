import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: { id: true, name: true, phone: true, email: true, role: true, zoneId: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, email: true, role: true, zoneId: true, isActive: true, createdAt: true, totpEnabled: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async create(dto: { name: string; phone: string; email?: string; role: Role; password: string; zoneId?: string }) {
    const exists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Ce numéro est déjà utilisé');
    const { password, ...rest } = dto;
    return this.prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, name: true, phone: true, role: true, createdAt: true },
    });
  }

  async update(id: string, dto: Partial<{ name: string; email: string; role: Role; zoneId: string; isActive: boolean }>) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, phone: true, role: true, isActive: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }
}
