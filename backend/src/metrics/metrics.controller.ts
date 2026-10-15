import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get, Headers, NotFoundException, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { MetricsService } from './metrics.service';

/**
 * Métriques Prometheus. Protégées par METRICS_TOKEN (Bearer) ; en
 * production sans jeton configuré, l'endpoint n'est pas exposé. Nginx
 * refuse aussi l'accès public (/api/v1/metrics) : collecte interne.
 */
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get()
  @ApiExcludeEndpoint()
  async getMetrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const token = process.env.METRICS_TOKEN;
    if (!token) {
      if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    } else {
      const given = Buffer.from(String(auth ?? '').replace(/^Bearer /, ''));
      const exp = Buffer.from(token);
      if (given.length !== exp.length || !timingSafeEqual(given, exp)) throw new UnauthorizedException();
    }
    res.set('Content-Type', this.metrics.contentType).send(await this.metrics.toPrometheusText());
  }
}
