import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AccountStatus } from '@prisma/client';
import { ALLOW_IN_TRAINING_KEY } from '../../common/decorators/allow-in-training.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) throw new UnauthorizedException(err?.message || 'Token invalide ou manquant');
    // Un compte en formation n'a aucun droit opérationnel (audit F19) :
    // seules les routes explicitement marquées @AllowInTraining() lui sont ouvertes.
    if (user.status === AccountStatus.IN_TRAINING
      && !this.reflector.getAllAndOverride<boolean>(ALLOW_IN_TRAINING_KEY, [context.getHandler(), context.getClass()])) {
      throw new ForbiddenException('Compte en formation : accès limité aux modules de formation');
    }
    return user;
  }
}
