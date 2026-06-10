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
import { Role, User } from '@prisma/client';
import { encryptTotpSecret, decryptTotpSecret, isEncrypted } from './totp-crypto';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 par minute par numéro
const OTP_DAILY_LIMIT = 5; // max 5 OTP par numéro par 24 h (anti SMS-pumping)

// Verrouillage anti-bruteforce : 10 échecs → 15 min de blocage (par numéro).
// En mémoire : suffisant pour le MVP mono-instance ; passer sur Redis en HA.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// Rôles soumis au MFA obligatoire (niveau MAIRIE et au-dessus)
const MFA_REQUIRED_ROLES: Role[] = [
  Role.MAIRIE,
  Role.HYDRO_METEO,
  Role.PREFECTURE,
  Role.GOUVERNORAT,
  Role.PROTECTION_CIVILE,
  Role.SUPERVISEUR_REGIONAL,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginFailures = new Map<string, { count: number; lockedUntil?: number }>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private sms: SmsService,
  ) {}

  async validateUser(phone: string, password: string): Promise<User | null> {
    const entry = this.loginFailures.get(phone);
    if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
      const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
      throw new ForbiddenException(
        `Compte temporairement verrouillé suite à trop d'échecs. Réessayez dans ${minutes} min.`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });
    const valid = user?.passwordHash && user.isActive
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!valid) {
      const count = (entry?.count ?? 0) + 1;
      const lockedUntil = count >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_LOCK_MS : undefined;
      this.loginFailures.set(phone, { count, lockedUntil });
      if (lockedUntil) this.logger.warn(`Verrouillage login : ${phone} (${count} échecs)`);
      return null;
    }

    this.loginFailures.delete(phone);
    return user;
  }

  /**
   * Connexion par mot de passe. Pour les rôles MAIRIE+, le MFA TOTP est
   * obligatoire : la réponse ne contient pas de tokens mais un mfaToken
   * temporaire (10 min) à échanger via /auth/totp/login.
   */
  async login(user: User) {
    if (MFA_REQUIRED_ROLES.includes(user.role)) {
      const mfaToken = this.jwt.sign(
        { sub: user.id, phone: user.phone, role: user.role, mfa: 'totp' },
        { expiresIn: '10m' },
      );
      if (user.totpEnabled) {
        return { mfaRequired: true, mfaToken };
      }
      // Premier login : enrôlement TOTP obligatoire avant délivrance des tokens
      return { mfaSetupRequired: true, mfaToken };
    }
    return this.issueTokens(user);
  }

  private issueTokens(user: User) {
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      refreshToken: this.jwt.sign(payload, {
        secret: this.cfg.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
      user: { id: user.id, name: user.name, role: user.role, phone: user.phone },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.cfg.get('JWT_REFRESH_SECRET'),
      });
      if (payload.mfa) throw new UnauthorizedException();
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  /** Vérifie un mfaToken (étape intermédiaire MFA) et retourne l'utilisateur. */
  private async resolveMfaToken(mfaToken: string): Promise<User> {
    let payload: any;
    try {
      payload = this.jwt.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Session MFA expirée, reconnectez-vous');
    }
    if (payload.mfa !== 'totp') throw new UnauthorizedException('Token MFA invalide');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }

  /** Enrôlement TOTP pendant le login (avec mfaToken, avant d'avoir un access token). */
  async setupTotpWithMfaToken(mfaToken: string) {
    const user = await this.resolveMfaToken(mfaToken);
    if (user.totpEnabled) {
      throw new BadRequestException('TOTP déjà configuré pour ce compte');
    }
    return this.generateTotpSecret(user);
  }

  /** Étape 2 du login MFA : vérifie le code TOTP et délivre les tokens. */
  async totpLogin(mfaToken: string, code: string) {
    const user = await this.resolveMfaToken(mfaToken);
    if (!user.totpSecret) {
      throw new BadRequestException('TOTP non configuré — appelez d\'abord /auth/totp/setup-mfa');
    }
    const secret = this.readTotpSecret(user);
    if (!authenticator.verify({ token: code, secret })) {
      throw new UnauthorizedException('Code TOTP incorrect');
    }
    if (!user.totpEnabled) {
      await this.prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      this.logger.log(`TOTP activé pour ${user.phone} (${user.role})`);
    }
    return this.issueTokens(user);
  }

  // ── OTP (inscription / connexion citoyenne) ────────────────────────────────

  /** Génère et envoie un OTP (SMS en prod, log en dev). */
  async requestOtp(phone: string): Promise<{ message: string; dev_code?: string }> {
    // Rate-limit : pas plus d'un OTP par minute par numéro
    const recent = await this.prisma.otpRequest.findFirst({
      where: { phone, createdAt: { gt: new Date(Date.now() - OTP_RATE_LIMIT_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('Un code a déjà été envoyé, veuillez patienter 1 minute');
    }

    // Quota journalier anti SMS-pumping : 5 OTP / numéro / 24 h
    const dailyCount = await this.prisma.otpRequest.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (dailyCount >= OTP_DAILY_LIMIT) {
      throw new BadRequestException('Limite de codes atteinte pour aujourd\'hui, réessayez demain');
    }

    // Invalider les anciens codes non utilisés
    await this.prisma.otpRequest.updateMany({
      where: { phone, used: false },
      data: { used: true },
    });

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
    await this.prisma.otpRequest.create({
      data: { phone, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    const isDev = this.cfg.get('NODE_ENV') !== 'production';
    // RETURN_OTP_DEV_CODE=true permet de récupérer le code en staging sans SMS
    const returnCode = isDev || this.cfg.get('RETURN_OTP_DEV_CODE') === 'true';
    if (isDev) {
      this.logger.log(`[DEV OTP] ${phone} → ${code}`);
    } else if (!returnCode) {
      try {
        await this.sms.sendSms(phone, `OLEL : votre code de vérification est ${code}. Valable 10 minutes.`);
      } catch (err) {
        this.logger.error(`Échec envoi SMS OTP à ${phone}: ${(err as Error).message}`);
        throw new BadRequestException('Envoi du SMS impossible, réessayez dans quelques minutes');
      }
    }

    return {
      message: `Code envoyé au ${phone}`,
      ...(returnCode ? { dev_code: code } : {}),
    };
  }

  /** Vérifie le code OTP et connecte ou crée le compte CITOYEN. */
  async verifyOtp(phone: string, code: string, name?: string) {
    const otpRecord = await this.prisma.otpRequest.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord || otpRecord.code !== code) {
      // Invalider le code immédiatement : après 1 échec l'attaquant doit redemander
      if (otpRecord) {
        await this.prisma.otpRequest.update({ where: { id: otpRecord.id }, data: { used: true } });
      }
      throw new UnauthorizedException('Code incorrect ou expiré');
    }

    // Marquer le code comme utilisé
    await this.prisma.otpRequest.update({ where: { id: otpRecord.id }, data: { used: true } });

    // Chercher ou créer le compte citoyen
    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // Résoudre la zone par défaut (Matam)
      const defaultZone = await this.prisma.zone.findFirst({
        where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
      });
      user = await this.prisma.user.create({
        data: {
          phone,
          name: name || `Citoyen ${phone.slice(-4)}`,
          role: Role.CITOYEN,
          isActive: true,
          zoneId: defaultZone?.id,
          // Pas de mot de passe pour les comptes OTP (connexion uniquement par OTP)
        },
      });
      this.logger.log(`Nouveau citoyen créé via OTP : ${phone}`);
    }

    return this.login(user);
  }

  // ── TOTP (2FA pour opérateurs) ─────────────────────────────────────────────

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

  /** Lit le secret TOTP (déchiffre, migre les secrets hérités en clair). */
  private readTotpSecret(user: User): string {
    const stored = user.totpSecret as string;
    const secret = decryptTotpSecret(stored, this.totpPassphrase());
    if (!isEncrypted(stored)) {
      // Migration transparente : re-chiffrer le secret hérité
      this.prisma.user
        .update({
          where: { id: user.id },
          data: { totpSecret: encryptTotpSecret(secret, this.totpPassphrase()) },
        })
        .catch((err) => this.logger.error(`Migration secret TOTP ${user.id}: ${err.message}`));
    }
    return secret;
  }

  private async generateTotpSecret(user: User) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptTotpSecret(secret, this.totpPassphrase()), totpEnabled: false },
    });
    const otpauthUrl = authenticator.keyuri(user.phone, 'OLEL', secret);
    return { secret, otpauthUrl };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.generateTotpSecret(user);
  }

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new BadRequestException('TOTP non configuré');
    const valid = authenticator.verify({ token, secret: this.readTotpSecret(user) });
    if (valid && !user.totpEnabled) {
      await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    }
    return valid;
  }
}
