import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class BotApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-bot-api-key'];
    const expectedKey = process.env.BOT_API_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException('BOT_API_KEY non configuré sur le serveur');
    }

    // Comparaison à temps constant (anti timing attack)
    const provided = Buffer.from(String(providedKey || ''));
    const expected = Buffer.from(expectedKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Clé API bot invalide ou manquante');
    }

    return true;
  }
}
