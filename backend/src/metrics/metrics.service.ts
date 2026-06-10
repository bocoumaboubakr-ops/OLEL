import { Injectable } from '@nestjs/common';

interface Counter { [key: string]: number }

@Injectable()
export class MetricsService {
  private counters: Counter = {};
  private histograms: Record<string, number[]> = {};
  private readonly startTime = Date.now();

  inc(name: string, labels: Record<string, string> = {}, value = 1) {
    const key = this.key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  }

  observe(name: string, value: number, labels: Record<string, string> = {}) {
    const key = this.key(name, labels);
    if (!this.histograms[key]) this.histograms[key] = [];
    this.histograms[key].push(value);
    // Keep only last 1000 observations per key
    if (this.histograms[key].length > 1000) this.histograms[key].shift();
  }

  toPrometheusText(): string {
    const lines: string[] = [];
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    lines.push('# HELP olel_uptime_seconds Uptime du backend en secondes');
    lines.push('# TYPE olel_uptime_seconds gauge');
    lines.push(`olel_uptime_seconds ${uptimeSeconds}`);

    lines.push('# HELP process_memory_rss_bytes Mémoire RSS du process');
    lines.push('# TYPE process_memory_rss_bytes gauge');
    lines.push(`process_memory_rss_bytes ${process.memoryUsage().rss}`);

    lines.push('# HELP process_heap_used_bytes Heap utilisée');
    lines.push('# TYPE process_heap_used_bytes gauge');
    lines.push(`process_heap_used_bytes ${process.memoryUsage().heapUsed}`);

    for (const [key, value] of Object.entries(this.counters)) {
      const [name, labelStr] = key.split('{');
      lines.push(`${name}{${labelStr} ${value}`);
    }

    for (const [key, values] of Object.entries(this.histograms)) {
      if (!values.length) continue;
      const [name, labelStr] = key.split('{');
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const lblBase = labelStr ? `{${labelStr}` : '{';
      lines.push(`${name}_avg${lblBase}le="avg"} ${avg.toFixed(2)}`);
      lines.push(`${name}_p50${lblBase}le="0.5"} ${p50}`);
      lines.push(`${name}_p95${lblBase}le="0.95"} ${p95}`);
      lines.push(`${name}_p99${lblBase}le="0.99"} ${p99}`);
      lines.push(`${name}_count${lblBase}} ${values.length}`);
      lines.push(`${name}_sum${lblBase}} ${sum.toFixed(2)}`);
    }

    return lines.join('\n') + '\n';
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    return labelStr ? `${name}{${labelStr}}` : `${name}{}`;
  }
}
