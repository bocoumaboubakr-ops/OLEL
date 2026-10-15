import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../session.service';

/**
 * Le jeton ne fait foi QUE de la session (`sid`) et de sa version (`tv`).
 * Rôle, zone et statut sont relus en base à chaque requête (audit F01, F07) :
 * une suspension, un changement de rôle ou de zone prend effet immédiatement.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService, private sessions: SessionService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.get('JWT_SECRET'),
    });
  }

  validate(payload: any) {
    return this.sessions.resolveAccess(payload);
  }
}
