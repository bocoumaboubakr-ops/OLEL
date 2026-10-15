import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { SmsService } from '../notifications/channels/sms.service';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { AccountStatus, Role, User } from '@prisma/client';
import { encryptTotpSecret, decryptTotpSecret, isEncrypted } from './totp-crypto';
import { SessionService, requiresMfa } from './session.service';
import { accountStatusData, canAuthenticate } from './account-status';
import { AuditService } from '../audit/audit.service';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 par minute par numéro
const OTP_DAILY_LIMIT = 5; // max 5 OTP par numéro par 24 h (anti SMS-pumping)

// Verrouillages persistés en base (partagés entre instances, survivent au redémarrage)
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MFA_MAX_FAILURES = 5;
const MFA_LOCK_MS = 15 * 60 * 1000;

// Hash factice : égalise le temps de réponse quand le numéro est inconnu
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 10);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private sms: SmsService,
    private sessions: SessionService,
    private audit: AuditService,
  ) {}

  async validateUser(phone: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user?.loginLockedUntil && user.loginLockedUntil > new Date()) {
      const minutes = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Compte temporairement verrouillé suite à trop d'échecs. Réessayez dans ${minutes} min.`,
      );
    }

    const hashOk = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    const valid = !!user?.passwordHash && hashOk && canAuthenticate(user.status) && !user.deletedAt;

    if (!valid) {
      if (user) {
        const updated = await this.prisma.user.update({
          where: { id: user.id },
          data: { loginFailures: { increment: 1 } },
          select: { loginFailures: true },
        });
        if (updated.loginFailures >= LOGIN_MAX_FAILURES) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MS), loginFailures: 0 },
          });
          this.logger.warn(`Verrouillage login : compte ${user.id}`);
        }
      }
      return null;
    }

    if (user.loginFailures || user.loginLockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { loginFailures: 0, loginLockedUntil: null } });
    }
    return user;
  }

  /**
   * Premier facteur validé (mot de passe ou OTP). Pour les rôles MAIRIE+, le
   * MFA TOTP est obligatoire : on renvoie un jeton intermédiaire (10 min) qui
   * ne donne accès à aucune route de l'API.
   */
  async login(user: User) {
    if (!canAuthenticate(user.status) || user.deletedAt) {
      throw new UnauthorizedException('Compte suspendu — contactez votre responsable');
    }
    if (requiresMfa(user.role)) {
      const mfaToken = this.jwt.sign(
        { sub: user.id, tv: user.tokenVersion, typ: 'mfa_pending' },
        { expiresIn: '10m' },
      );
      return user.totpEnabled ? { mfaRequired: true, mfaToken } : { mfaSetupRequired: true, mfaToken };
    }
    return this.sessions.issue(user, false);
  }

  refreshTokens(refreshToken: string) {
    return this.sessions.rotate(refreshToken);
  }

  async logout(sessionId: string) {
    await this.sessions.revokeSession(sessionId, 'logout');
    return { success: true };
  }

  /** Vérifie un jeton intermédiaire MFA et retourne l'utilisateur courant. */
  private async resolveMfaToken(mfaToken: string): Promise<User> {
    let payload: any;
    try {
      payload = this.jwt.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Session MFA expirée, reconnectez-vous');
    }
    if (payload?.typ !== 'mfa_pending') throw new UnauthorizedException('Token MFA invalide');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !canAuthenticate(user.status) || user.deletedAt || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Session MFA invalide, reconnectez-vous');
    }
    return user;
  }

  /** Enrôlement TOTP au premier login (jeton intermédiaire, avant tout accès). */
  async setupTotpWithMfaToken(mfaToken: string) {
    const user = await this.resolveMfaToken(mfaToken);
    if (user.totpEnabled) {
      throw new BadRequestException('TOTP déjà configuré pour ce compte');
    }
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptTotpSecret(secret, this.totpPassphrase()), totpEnabled: false },
    });
    return { secret, otpauthUrl: authenticator.keyuri(user.phone, 'OLEL', secret) };
  }

  /** Étape 2 du login MFA : vérifie le code TOTP et ouvre une session « mfa ». */
  async totpLogin(mfaToken: string, code: string) {
    const user = await this.resolveMfaToken(mfaToken);
    if (!user.totpSecret) {
      throw new BadRequestException('TOTP non configuré — appelez d\'abord /auth/totp/setup-mfa');
    }
    await this.assertMfaNotLocked(user);
    if (!authenticator.verify({ token: code, secret: this.readTotpSecret(user) })) {
      await this.recordMfaFailure(user.id);
      throw new UnauthorizedException('Code TOTP incorrect');
    }
    const fresh = await this.prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, mfaFailures: 0, mfaLockedUntil: null },
    });
    if (!user.totpEnabled) this.logger.log(`TOTP activé pour le compte ${user.id} (${user.role})`);
    return this.sessions.issue(fresh, true);
  }

  private async assertMfaNotLocked(user: User) {
    if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
      throw new ForbiddenException('Trop de codes incorrects, réessayez dans 15 minutes');
    }
  }

  private async recordMfaFailure(userId: string) {
    const { mfaFailures } = await this.prisma.user.update({
      where: { id: userId }, data: { mfaFailures: { increment: 1 } }, select: { mfaFailures: true },
    });
    if (mfaFailures >= MFA_MAX_FAILURES) {
      await this.prisma.user.update({
        where: { id: userId }, data: { mfaLockedUntil: new Date(Date.now() + MFA_LOCK_MS), mfaFailures: 0 },
      });
      this.logger.warn(`Verrouillage MFA : compte ${userId}`);
    }
  }

  // ── OTP (connexion citoyenne / sentinelle) ─────────────────────────────────

  /** Empreinte d'un OTP : le code n'est jamais stocké en clair. */
  private otpDigest(phone: string, code: string): string {
    return createHmac('sha256', this.cfg.get<string>('JWT_SECRET') || '').update(`${phone}:${code}`).digest('hex');
  }

  private devCodeAllowed(): boolean {
    // Jamais en production, quelle que soit RETURN_OTP_DEV_CODE (aussi bloqué par env.validation).
    if (this.cfg.get('NODE_ENV') === 'production') return false;
    return true;
  }

  async requestOtp(phone: string): Promise<{ message: string; dev_code?: string }> {
    const recent = await this.prisma.otpRequest.findFirst({
      where: { phone, createdAt: { gt: new Date(Date.now() - OTP_RATE_LIMIT_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('Un code a déjà été envoyé, veuillez patienter 1 minute');
    }
    const dailyCount = await this.prisma.otpRequest.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (dailyCount >= OTP_DAILY_LIMIT) {
      throw new BadRequestException('Limite de codes atteinte pour aujourd\'hui, réessayez demain');
    }

    await this.prisma.otpRequest.updateMany({ where: { phone, used: false }, data: { used: true } });

    const code = String(randomInt(100000, 1000000)); // 6 chiffres, aléatoire cryptographique
    await this.prisma.otpRequest.create({
      data: { phone, code: this.otpDigest(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    if (this.devCodeAllowed()) {
      this.logger.log(`[DEV OTP] ${phone} → ${code}`);
      return { message: `Code envoyé au ${phone}`, dev_code: code };
    }
    try {
      await this.sms.sendSms(phone, `OLEL : votre code de vérification est ${code}. Valable 10 minutes.`);
    } catch (err) {
      this.logger.error(`Échec envoi SMS OTP : ${(err as Error).message}`);
      throw new BadRequestException('Envoi du SMS impossible, réessayez dans quelques minutes');
    }
    return { message: `Code envoyé au ${phone}` };
  }

  /** Vérifie l'OTP puis connecte (ou crée un compte CITOYEN pour un numéro inconnu). */
  async verifyOtp(phone: string, code: string, name?: string) {
    const otpRecord = await this.prisma.otpRequest.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // Le code est consommé dès la première tentative, réussie ou non.
    if (otpRecord) await this.prisma.otpRequest.update({ where: { id: otpRecord.id }, data: { used: true } });

    const expected = otpRecord ? Buffer.from(otpRecord.code) : Buffer.alloc(64);
    const given = Buffer.from(this.otpDigest(phone, code));
    if (!otpRecord || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Code incorrect ou expiré');
    }

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      const defaultZone = await this.prisma.zone.findFirst({
        where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
      });
      user = await this.prisma.user.create({
        data: {
          phone,
          name: name || `Citoyen ${phone.slice(-4)}`,
          role: Role.CITOYEN,
          ...accountStatusData(AccountStatus.ACTIVE),
          zoneId: defaultZone?.id,
        },
      });
      this.logger.log(`Nouveau compte citoyen créé via OTP (${user.id})`);
    }
    return this.login(user); // refuse les comptes suspendus (audit F07)
  }

  // ── TOTP (2FA opérateurs) ──────────────────────────────────────────────────

  private totpPassphrase(): string {
    const key = this.cfg.get<string>('TOTP_ENCRYPTION_KEY');
    if (!key || key.length < 32) {
      if (this.cfg.get('NODE_ENV') === 'production') {
        throw new Error('TOTP_ENCRYPTION_KEY absente ou < 32 caractères — requis en production');
      }
      return 'dev_totp_encryption_key_must_be_32_chars';
    }
    return key;
  }

  private readTotpSecret(user: User, field: 'totpSecret' | 'totpPendingSecret' = 'totpSecret'): string {
    const stored = user[field] as string;
    const secret = decryptTotpSecret(stored, this.totpPassphrase());
    if (field === 'totpSecret' && !isEncrypted(stored)) {
      this.prisma.user
        .update({ where: { id: user.id }, data: { totpSecret: encryptTotpSecret(secret, this.totpPassphrase()) } })
        .catch((err) => this.logger.error(`Migration secret TOTP ${user.id}: ${err.message}`));
    }
    return secret;
  }

  /**
   * Réenrôlement TOTP par un utilisateur connecté (audit F11) : exige le code
   * du facteur actuel, et le nouveau secret reste « en attente » tant qu'il
   * n'est pas confirmé — le facteur actuel n'est jamais désactivé entre-temps.
   */
  async setupTotp(userId: string, currentCode?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.totpEnabled && user.totpSecret) {
      await this.assertMfaNotLocked(user);
      if (!currentCode || !authenticator.verify({ token: currentCode, secret: this.readTotpSecret(user) })) {
        await this.recordMfaFailure(user.id);
        throw new UnauthorizedException('Code du facteur actuel requis pour changer de facteur');
      }
    }
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpPendingSecret: encryptTotpSecret(secret, this.totpPassphrase()) },
    });
    return { secret, otpauthUrl: authenticator.keyuri(user.phone, 'OLEL', secret) };
  }

  /** Confirme un secret en attente (et révoque les sessions), ou vérifie le facteur actuel. */
  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    await this.assertMfaNotLocked(user);

    if (user.totpPendingSecret) {
      const ok = authenticator.verify({ token, secret: this.readTotpSecret(user, 'totpPendingSecret') });
      if (!ok) { await this.recordMfaFailure(user.id); return false; }
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabled: true, mfaFailures: 0 },
        });
        await this.sessions.revokeAllForUser(userId, 'mfa_factor_changed', tx);
      });
      this.audit.log({ userId, action: 'auth.mfa_factor_changed', resource: 'user', resourceId: userId });
      return true;
    }
    if (!user.totpSecret) throw new BadRequestException('TOTP non configuré');
    const ok = authenticator.verify({ token, secret: this.readTotpSecret(user) });
    if (!ok) await this.recordMfaFailure(user.id);
    return ok;
  }
}
