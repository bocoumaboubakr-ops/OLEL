import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
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

  async setupTotp(userId: string) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
    });
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
