import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BotApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-bot-api-key'];
    const expectedKey = process.env.BOT_API_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException('BOT_API_KEY non configuré sur le serveur');
    }

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Clé API bot invalide ou manquante');
    }

    return true;
  }
}
