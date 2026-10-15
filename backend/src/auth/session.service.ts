import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, User } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { canAuthenticate } from './account-status';

/** Rôles soumis au second facteur obligatoire (niveau MAIRIE et au-dessus). */
export const MFA_REQUIRED_ROLES: Role[] = [
  Role.MAIRIE, Role.HYDRO_METEO, Role.PREFECTURE, Role.GOUVERNORAT,
  Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN,
];
export const requiresMfa = (role: Role) => MFA_REQUIRED_ROLES.includes(role);

export const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
/** Fenêtre tolérée pour deux rafraîchissements concurrents du même client. */
const ROTATION_GRACE_MS = 10_000;

type Tx = Prisma.TransactionClient | PrismaService;

export interface AccessClaims {
  sub: string; sid: string; tv: number; typ: 'access'; mfa: boolean;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Sessions et jetons (audit F01, F07, F11).
 *
 * - Jeton d'accès 15 min, porte `sid` (session) et `tv` (tokenVersion).
 *   Le rôle et la zone ne sont JAMAIS lus depuis le jeton : la stratégie JWT
 *   les relit en base à chaque requête.
 * - Refresh token = une ligne `sessions`, tourné à chaque usage.
 *   Réutilisation d'un jeton déjà tourné ⇒ vol présumé ⇒ toutes les sessions
 *   du compte sont révoquées.
 * - `mfa` sur la session : un rôle à MFA obligatoire ne peut rafraîchir
 *   qu'une session ouverte avec le second facteur.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private prisma: PrismaService, private jwt: JwtService, private cfg: ConfigService) {}

  async issue(user: User, mfa: boolean) {
    const sid = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: user.id, sid, tv: user.tokenVersion, typ: 'refresh' },
      { secret: this.cfg.get('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    await this.prisma.session.create({
      data: { id: sid, userId: user.id, tokenHash: sha256(refreshToken), mfa, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return this.buildResponse(user, sid, mfa, refreshToken);
  }

  private buildResponse(user: User, sid: string, mfa: boolean, refreshToken: string) {
    const claims: AccessClaims = { sub: user.id, sid, tv: user.tokenVersion, typ: 'access', mfa };
    return {
      accessToken: this.jwt.sign(claims, { expiresIn: ACCESS_TTL }),
      refreshToken,
      user: {
        id: user.id, name: user.name, role: user.role, phone: user.phone,
        zoneId: user.zoneId, status: user.status,
      },
    };
  }

  async rotate(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.cfg.get('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Session expirée, reconnectez-vous');
    }
    if (payload?.typ !== 'refresh' || !payload.sid) throw new UnauthorizedException('Jeton de session invalide');

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || !this.hashMatches(session.tokenHash, refreshToken)) {
      throw new UnauthorizedException('Session inconnue');
    }
    if (session.revokedAt) {
      await this.handleReuse(session);
      throw new UnauthorizedException('Session révoquée, reconnectez-vous');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Session expirée, reconnectez-vous');

    const user = session.user;
    if (!canAuthenticate(user.status) || payload.tv !== user.tokenVersion) {
      await this.revokeSession(session.id, 'invalidated');
      throw new UnauthorizedException('Session invalidée, reconnectez-vous');
    }
    if (requiresMfa(user.role) && !session.mfa) {
      await this.revokeSession(session.id, 'mfa_required');
      throw new UnauthorizedException('Votre rôle exige une reconnexion avec double authentification');
    }

    const newSid = randomUUID();
    const newRefresh = this.jwt.sign(
      { sub: user.id, sid: newSid, tv: user.tokenVersion, typ: 'refresh' },
      { secret: this.cfg.get('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Révocation conditionnelle : un seul gagnant si deux requêtes concurrentes
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: newSid, lastUsedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.session.create({
        data: { id: newSid, userId: user.id, tokenHash: sha256(newRefresh), mfa: session.mfa, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
      });
      return true;
    });
    if (!rotated) throw new UnauthorizedException('Session déjà renouvelée');
    return this.buildResponse(user, newSid, session.mfa, newRefresh);
  }

  private async handleReuse(session: { id: string; userId: string; revokedAt: Date | null; revokedReason: string | null }) {
    const recent = session.revokedAt && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (session.revokedReason === 'rotated' && !recent) {
      this.logger.warn(`Réutilisation d'un refresh token tourné (user ${session.userId}) — révocation globale`);
      await this.revokeAllForUser(session.userId, 'refresh_reuse');
    }
  }

  async revokeSession(sid: string, reason: string) {
    await this.prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }

  /** Invalide tous les jetons d'un compte (rôle, statut, zone, mot de passe, facteur MFA). */
  async revokeAllForUser(userId: string, reason: string, tx: Tx = this.prisma) {
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  private hashMatches(stored: string, token: string) {
    const a = Buffer.from(stored);
    const b = Buffer.from(sha256(token));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Résout un jeton d'accès vers l'identité COURANTE (stratégie JWT + WebSocket).
   * Lève UnauthorizedException si le jeton n'est plus valable.
   */
  async resolveAccess(payload: any) {
    if (payload?.typ !== 'access' || !payload.sid) throw new UnauthorizedException('Jeton d\'accès invalide');
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, phone: true, role: true, zoneId: true, status: true, tokenVersion: true, deletedAt: true } } },
    });
    const user = session?.user;
    if (!session || session.revokedAt || session.userId !== payload.sub || !user) {
      throw new UnauthorizedException('Session révoquée');
    }
    if (user.deletedAt || !canAuthenticate(user.status) || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Session invalidée, reconnectez-vous');
    }
    if (requiresMfa(user.role) && !session.mfa) {
      throw new UnauthorizedException('Double authentification requise pour ce rôle');
    }
    return { id: user.id, phone: user.phone, role: user.role, zoneId: user.zoneId, status: user.status, sessionId: session.id };
  }
}
