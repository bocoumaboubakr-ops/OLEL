import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Un mfaToken (étape intermédiaire TOTP) ne donne jamais accès à l'API
    if (payload.mfa) {
      throw new UnauthorizedException('Authentification MFA incomplète');
    }
    return { id: payload.sub, phone: payload.phone, role: payload.role, zoneId: payload.zoneId };
  }
}
