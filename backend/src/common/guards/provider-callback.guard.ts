import { CanActivate, ExecutionContext, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Authentification des rappels Africa's Talking (USSD, SVI) — audit F06, F26.
 *
 * Le fournisseur ne signe pas ses requêtes : l'URL de rappel déclarée dans
 * sa console porte un secret partagé (`?key=<AT_CALLBACK_SECRET>`), comparé
 * à temps constant. En production, un canal sans secret configuré est
 * refusé (503) plutôt que laissé ouvert à n'importe quel appelant.
 * Ces points d'entrée écrivant des signalements, une requête forgée ne doit
 * pas pouvoir en créer au nom d'un numéro arbitraire.
 */
@Injectable()
export class ProviderCallbackGuard implements CanActivate {
  private readonly logger = new Logger(ProviderCallbackGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const expected = process.env.AT_CALLBACK_SECRET;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('Canal non configuré (AT_CALLBACK_SECRET absent)');
      }
      this.logger.warn('AT_CALLBACK_SECRET absent — rappel fournisseur accepté sans contrôle (hors production uniquement)');
      return true;
    }
    const provided = Buffer.from(String(req.query?.key ?? ''));
    const exp = Buffer.from(expected);
    if (provided.length !== exp.length || !timingSafeEqual(provided, exp)) {
      throw new UnauthorizedException('Rappel fournisseur non authentifié');
    }
    return true;
  }
}
