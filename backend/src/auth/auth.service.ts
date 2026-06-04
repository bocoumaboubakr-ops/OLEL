import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { Role, User } from '@prisma/client';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 par minute par numéro

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  async validateUser(phone: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: User) {
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
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return this.login(user);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  // ── OTP (inscription / connexion citoyenne) ────────────────────────────────

  /** Génère et "envoie" un OTP (SMS en prod, log en dev). */
  async requestOtp(phone: string): Promise<{ message: string; dev_code?: string }> {
    // Rate-limit : pas plus d'un OTP par minute par numéro
    const recent = await this.prisma.otpRequest.findFirst({
      where: { phone, createdAt: { gt: new Date(Date.now() - OTP_RATE_LIMIT_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('Un code a déjà été envoyé, veuillez patienter 1 minute');
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

    // Envoi SMS (remplacer par vrai provider en prod : Africa's Talking, Orange SMS, etc.)
    const isDev = this.cfg.get('NODE_ENV') !== 'production';
    if (isDev) {
      this.logger.log(`[DEV OTP] ${phone} → ${code}`);
    } else {
      await this.sendSms(phone, `OLEL : votre code de vérification est ${code}. Valable 10 minutes.`);
    }

    return {
      message: `Code envoyé au ${phone}`,
      ...(isDev ? { dev_code: code } : {}),
    };
  }

  /** Vérifie le code OTP et connecte ou crée le compte CITOYEN. */
  async verifyOtp(phone: string, code: string, name?: string) {
    const otpRecord = await this.prisma.otpRequest.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord || otpRecord.code !== code) {
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

  /** Envoi SMS (stub — remplacer par le provider choisi). */
  private async sendSms(phone: string, message: string) {
    const provider = this.cfg.get('SMS_PROVIDER'); // 'africas_talking' | 'orange' | 'mock'
    if (!provider || provider === 'mock') {
      this.logger.warn(`[SMS MOCK] → ${phone}: ${message}`);
      return;
    }
    // TODO: intégrer Africa's Talking / Orange SMS Sénégal
    this.logger.error(`SMS provider "${provider}" non configuré — message non envoyé à ${phone}`);
  }

  // ── TOTP (2FA pour opérateurs) ─────────────────────────────────────────────

  async setupTotp(userId: string) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const otpauthUrl = authenticator.keyuri(user.phone, 'OLEL', secret);
    return { secret, otpauthUrl };
  }

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new BadRequestException('TOTP non configuré');
    const valid = authenticator.verify({ token, secret: user.totpSecret });
    if (valid && !user.totpEnabled) {
      await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    }
    return valid;
  }
}
