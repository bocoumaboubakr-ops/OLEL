import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { signMediaIn } from './media';

/**
 * Convertit les références de médias en URL signées dans les réponses des
 * requêtes AUTHENTIFIÉES (utilisateur résolu par JwtAuthGuard). Les
 * endpoints publics ou service-à-service (bot) reçoivent la forme canonique.
 * L'autorisation de voir le média découle de celle de voir la ressource.
 */
@Injectable()
export class MediaUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(map((body) => (req.user ? signMediaIn(body) : body)));
  }
}
