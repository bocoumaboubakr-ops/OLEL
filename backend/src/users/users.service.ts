import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const ROLE_LEVEL: Record<Role, number> = {
  CITOYEN: 0, SENTINELLE: 1, MAIRIE: 2, PREFECTURE: 3,
  GOUVERNORAT: 4, PROTECTION_CIVILE: 4, ADMIN: 99, SUPER_ADMIN: 99,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}


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

  /**
   * Création d'une sentinelle par un MAIRIE ou ADMIN.
   * Génère un mot de passe temporaire, crée le compte inactif (activation après formations).
   * Retourne le mot de passe temporaire pour que le mairie puisse le transmettre.
   */
  async createSentinelle(
    dto: { name: string; phone: string; zoneId?: string },
    creator: { id: string; role: Role; zoneId?: string },
  ) {
    // MAIRIE ne peut créer des sentinelles que dans sa propre zone
    if (creator.role === Role.MAIRIE && dto.zoneId && dto.zoneId !== creator.zoneId) {
      throw new ForbiddenException('Vous ne pouvez créer des sentinelles que dans votre zone');
    }

    const exists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Ce numéro est déjà enregistré dans le système');

    const zoneId = dto.zoneId || creator.zoneId || (await this.prisma.zone.findFirst({
      where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
    })).id;

    // Génère un mot de passe temporaire lisible (8 chars)
    const tempPassword = this.generateTempPassword();
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        role: Role.SENTINELLE,
        isActive: false, // activé après validation des formations obligatoires
        zoneId,
        passwordHash: await bcrypt.hash(tempPassword, 10),
      },
      select: { id: true, name: true, phone: true, role: true, isActive: true, zoneId: true, createdAt: true },
    });

    this.logger.log(`Sentinelle créée par ${creator.role} ${creator.id}: ${dto.phone}`);

    return {
      ...user,
      tempPassword, // À transmettre à la sentinelle (SMS ou en main propre)
      message: `Compte sentinelle créé. Mot de passe temporaire : ${tempPassword}. La sentinelle doit compléter les formations obligatoires avant activation.`,
    };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async findAll(filters: { page?: number; limit?: number; role?: Role; zoneId?: string }) {
    const { page = 1, limit = 50, role, zoneId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (role) where.role = role;
    if (zoneId) where.zoneId = zoneId;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip, take: limit, where,
        select: { id: true, name: true, phone: true, email: true, role: true, zoneId: true, zone: { select: { name: true } }, isActive: true, lastActiveAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, limit };
  }

  async update(
    id: string,
    dto: Partial<{ name: string; email: string; role: Role; zoneId: string; isActive: boolean }>,
    caller?: { id: string; role: Role },
  ) {
    const target = await this.findOne(id);
    // MAIRIE ne peut modifier que des sentinelles de sa zone
    if (caller && caller.role === Role.MAIRIE) {
      const targetUser = await this.prisma.user.findUnique({ where: { id }, select: { role: true, zoneId: true } });
      if (targetUser.role !== Role.SENTINELLE) {
        throw new ForbiddenException('Un mairie ne peut modifier que des sentinelles');
      }
      // Bloquer la promotion de rôle
      if (dto.role && dto.role !== Role.SENTINELLE) {
        throw new ForbiddenException('Un mairie ne peut pas changer le rôle d\'une sentinelle');
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, phone: true, role: true, isActive: true },
    });
  }

  async changePassword(id: string, newPassword: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { success: true };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }
}
