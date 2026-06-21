import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(@Optional() private metrics?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip } = req;
    const start = Date.now();

    // Masquer les données sensibles dans les logs
    const safeUrl = url.replace(/\/auth\/.*/, '/auth/***');

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const status = res.statusCode;
        const duration = Date.now() - start;
        this.logger.log(`${method} ${safeUrl} ${status} ${duration}ms`);
        this.metrics?.inc('http_requests_total', { method, status: String(status) });
        this.metrics?.observe('http_request_duration_ms', duration, { method });
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        const status = err.status || 500;
        this.logger.error(`${method} ${safeUrl} ${status} ${duration}ms — ${err.message}`);
        this.metrics?.inc('http_requests_total', { method, status: String(status) });
        return throwError(() => err);
      }),
    );
  }
}
