import { Throttle } from '@nestjs/throttler';

/**
 * Rate limiting strict : 5 requêtes par minute.
 * À utiliser sur les endpoints sensibles : login, totp/verify.
 */
export const ThrottleStrict = () => Throttle({ default: { limit: 5, ttl: 60000 } });

/**
 * Rate limiting normal : 60 requêtes par minute (défaut API).
 */
export const ThrottleNormal = () => Throttle({ default: { limit: 60, ttl: 60000 } });

/**
 * Rate limiting relaxé : 200 requêtes par minute (lecture publique).
 */
export const ThrottleRelaxed = () => Throttle({ default: { limit: 200, ttl: 60000 } });
