import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Métriques Prometheus (audit F33) produites par prom-client — plus de
 * texte assemblé à la main. Les indicateurs opérationnels (chaîne d'alerte)
 * sont enregistrés par OperationalMetricsService sur ce même registre.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequests = new Counter({
    name: 'olel_http_requests_total', help: 'Requêtes HTTP traitées', labelNames: ['method', 'status'] as const, registers: [this.registry],
  });

  private readonly httpDuration = new Histogram({
    name: 'olel_http_request_duration_seconds', help: 'Durée des requêtes HTTP',
    labelNames: ['method'] as const, buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'olel_' });
  }

  /** Compatibilité avec l'intercepteur HTTP existant. */
  inc(name: string, labels: Record<string, string> = {}, value = 1) {
    if (name === 'http_requests_total') this.httpRequests.inc({ method: labels.method ?? '', status: labels.status ?? '' }, value);
  }

  observe(name: string, value: number, labels: Record<string, string> = {}) {
    if (name === 'http_request_duration_ms') this.httpDuration.observe({ method: labels.method ?? '' }, value / 1000);
  }

  gauge(name: string, help: string, labelNames: string[], collect: (g: Gauge<string>) => Promise<void>) {
    return new Gauge({ name, help, labelNames, registers: [this.registry], async collect() { await collect(this); } });
  }

  toPrometheusText(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType() {
    return this.registry.contentType;
  }
}
