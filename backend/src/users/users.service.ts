import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccountStatus, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { TerritoryService } from '../common/territory/territory.service';
import { accountStatusData } from '../auth/account-status';
import { Caller, Decision, UserChange, decideCreate, decideUpdate, isSessionSensitive, TERRITORY_EXEMPT } from './user-policy';

const PUBLIC_SELECT = {
  id: true, name: true, phone: true, email: true, role: true, language: true, zoneId: true,
  isActive: true, status: true, createdAt: true, totpEnabled: true,
  trainingCompletedAt: true, habilitatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private sessions: SessionService,
    private territory: TerritoryService,
  ) {}

  private enforce(decision: Decision, caller: Caller, action: string, resourceId?: string) {
    if (!decision.allowed) {
      // Toute tentative refusée laisse une trace exploitable (audit F01)
      this.audit.log({ userId: caller.id, action: `${action}.denied`, resource: 'user', resourceId, details: { reason: decision.reason, callerRole: caller.role } });
      throw new ForbiddenException(decision.reason);
    }
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  /** Lecture d'un compte limitée au territoire de l'appelant (hors ADMIN). */
  async findOneScoped(id: string, caller: Caller) {
    const user = await this.findOne(id);
    if (!TERRITORY_EXEMPT.includes(caller.role) && caller.id !== id
      && !(await this.territory.isWithin(user.zoneId, caller.zoneId))) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async setLanguage(id: string, language: string) {
    if (!['fr', 'ff', 'wo', 'snk'].includes(language)) {
      throw new ConflictException('Langue non supportée (fr | ff | wo | snk)');
    }
    await this.prisma.user.update({ where: { id }, data: { language } });
    return { success: true, language };
  }

  async updateMe(id: string, dto: { name?: string; email?: string }) {
    return this.prisma.user.update({ where: { id }, data: { name: dto.name, email: dto.email }, select: PUBLIC_SELECT });
  }

  async create(
    dto: { name: string; phone: string; email?: string; role: Role; password: string; zoneId?: string },
    caller: Caller,
  ) {
    const zoneInTerritory = dto.zoneId ? await this.territory.isWithin(dto.zoneId, caller.zoneId) : false;
    this.enforce(decideCreate(caller, dto.role, { zoneInTerritory }), caller, 'user.create');

    const exists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Ce numéro est déjà utilisé');
    const { password, ...rest } = dto;
    const status = dto.role === Role.SENTINELLE ? AccountStatus.IN_TRAINING : AccountStatus.ACTIVE;
    const created = await this.prisma.user.create({
      data: {
        ...rest,
        ...accountStatusData(status),
        passwordHash: await bcrypt.hash(password, 10),
        ...(status === AccountStatus.ACTIVE && dto.role !== Role.CITOYEN ? { habilitatedAt: new Date(), habilitatedById: caller.id } : {}),
      },
      select: { id: true, name: true, phone: true, role: true, status: true, createdAt: true },
    });
    this.audit.log({ userId: caller.id, action: 'user.create', resource: 'user', resourceId: created.id, details: { role: dto.role, zoneId: dto.zoneId } });
    return created;
  }

  /**
   * Création d'une sentinelle par une autorité de terrain. Le compte naît
   * IN_TRAINING : il peut se connecter pour suivre ses formations, sans aucun
   * droit opérationnel tant qu'un responsable ne l'a pas habilité (audit F19).
   */
  async createSentinelle(dto: { name: string; phone: string; zoneId?: string }, creator: Caller) {
    const zoneId = dto.zoneId || creator.zoneId;
    if (!zoneId) throw new ForbiddenException('Zone de rattachement requise');
    if (!TERRITORY_EXEMPT.includes(creator.role) && !(await this.territory.isWithin(zoneId, creator.zoneId))) {
      this.enforce({ allowed: false, reason: 'Vous ne pouvez créer des sentinelles que dans votre territoire' }, creator, 'user.create_sentinelle');
    }

    const exists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Ce numéro est déjà enregistré dans le système');

    const tempPassword = this.generateTempPassword();
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        role: Role.SENTINELLE,
        ...accountStatusData(AccountStatus.IN_TRAINING),
        zoneId,
        passwordHash: await bcrypt.hash(tempPassword, 10),
      },
      select: { id: true, name: true, phone: true, role: true, status: true, zoneId: true, createdAt: true },
    });
    this.audit.log({ userId: creator.id, action: 'user.create_sentinelle', resource: 'user', resourceId: user.id, details: { zoneId } });

    return {
      ...user,
      tempPassword,
      message: `Compte sentinelle créé (en formation). Mot de passe temporaire : ${tempPassword}. ` +
        'La sentinelle peut se connecter pour suivre ses formations ; un responsable doit ensuite l\'habiliter.',
    };
  }

  /** Mot de passe temporaire lisible, aléatoire cryptographique (audit F11). */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join('');
  }

  async findAll(filters: { page?: number; limit?: number; role?: Role; zoneId?: string }, caller: Caller) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role;

    // Cloisonnement territorial (audit F08)
    if (TERRITORY_EXEMPT.includes(caller.role)) {
      if (filters.zoneId) where.zoneId = filters.zoneId;
    } else {
      const scope = caller.zoneId ? await this.territory.subtree(caller.zoneId) : [];
      where.zoneId = filters.zoneId
        ? (scope.includes(filters.zoneId) ? filters.zoneId : '__hors_territoire__')
        : { in: scope };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (page - 1) * limit, take: limit, where,
        select: { ...PUBLIC_SELECT, zone: { select: { name: true } }, lastActiveAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, limit };
  }

  async update(
    id: string,
    dto: { name?: string; email?: string; role?: Role; zoneId?: string; status?: AccountStatus; isActive?: boolean },
    caller: Caller,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, zoneId: true, status: true } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    // `isActive` (ancien client) est traduit en statut explicite
    const status = dto.status ?? (dto.isActive === undefined ? undefined
      : dto.isActive ? AccountStatus.ACTIVE : AccountStatus.SUSPENDED);
    const change: UserChange = {
      name: dto.name, email: dto.email,
      ...(dto.role !== undefined && dto.role !== target.role ? { role: dto.role } : {}),
      ...(status !== undefined && status !== target.status ? { status } : {}),
      ...(dto.zoneId !== undefined && dto.zoneId !== target.zoneId ? { zoneId: dto.zoneId } : {}),
    };

    const isAdmin = TERRITORY_EXEMPT.includes(caller.role);
    const facts = {
      targetInTerritory: isAdmin || await this.territory.isWithin(target.zoneId, caller.zoneId),
      newZoneInTerritory: change.zoneId === undefined || isAdmin || await this.territory.isWithin(change.zoneId, caller.zoneId),
    };
    this.enforce(decideUpdate(caller, target, change, facts), caller, 'user.update', id);

    const data: Prisma.UserUpdateInput = {};
    if (change.name !== undefined) data.name = change.name;
    if (change.email !== undefined) data.email = change.email;
    if (change.role !== undefined) data.role = change.role;
    if (change.zoneId !== undefined) data.zone = { connect: { id: change.zoneId } };
    if (change.status !== undefined) {
      Object.assign(data, accountStatusData(change.status));
      if (change.status === AccountStatus.ACTIVE && target.status !== AccountStatus.ACTIVE) {
        data.habilitatedAt = new Date();
        data.habilitatedById = caller.id;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data, select: { id: true, name: true, phone: true, role: true, status: true, isActive: true, zoneId: true } });
      if (isSessionSensitive(change)) await this.sessions.revokeAllForUser(id, 'account_changed', tx);
      return u;
    });
    this.audit.log({
      userId: caller.id, action: 'user.update', resource: 'user', resourceId: id,
      details: { from: { role: target.role, status: target.status, zoneId: target.zoneId }, change },
    });
    return updated;
  }

  async changePassword(id: string, newPassword: string, caller: Caller) {
    await this.assertCanManage(id, caller, 'user.change_password');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), loginFailures: 0, loginLockedUntil: null } });
      await this.sessions.revokeAllForUser(id, 'password_changed', tx);
    });
    this.audit.log({ userId: caller.id, action: 'user.change_password', resource: 'user', resourceId: id });
    return { success: true };
  }

  /** Réinitialisation du second facteur (téléphone perdu) — réenrôlement au prochain login. */
  async resetMfa(id: string, caller: Caller) {
    await this.assertCanManage(id, caller, 'user.reset_mfa');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { totpSecret: null, totpPendingSecret: null, totpEnabled: false, mfaFailures: 0, mfaLockedUntil: null } });
      await this.sessions.revokeAllForUser(id, 'mfa_reset', tx);
    });
    this.audit.log({ userId: caller.id, action: 'user.reset_mfa', resource: 'user', resourceId: id });
    return { success: true };
  }

  async remove(id: string, caller: Caller) {
    await this.assertCanManage(id, caller, 'user.suspend');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: accountStatusData(AccountStatus.SUSPENDED) });
      await this.sessions.revokeAllForUser(id, 'suspended', tx);
    });
    this.audit.log({ userId: caller.id, action: 'user.suspend', resource: 'user', resourceId: id });
    return { success: true };
  }

  private async assertCanManage(id: string, caller: Caller, action: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, zoneId: true } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    const isAdmin = TERRITORY_EXEMPT.includes(caller.role);
    const facts = { targetInTerritory: isAdmin || await this.territory.isWithin(target.zoneId, caller.zoneId), newZoneInTerritory: true };
    // Une action de gestion équivaut à un changement sensible (statut/identifiants)
    this.enforce(decideUpdate(caller, target, { status: AccountStatus.SUSPENDED }, facts), caller, action, id);
  }
}
