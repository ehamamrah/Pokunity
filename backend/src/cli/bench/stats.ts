export interface BenchResult {
  name: string;
  requests: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  non2xx: number;
  errors: number;
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

export function toResult(name: string, latencies: number[], seconds: number, non2xx: number, errors: number): BenchResult {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    name, requests: sorted.length, rps: Math.round(sorted.length / seconds),
    p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), non2xx, errors,
  };
}

export function toMarkdown(results: BenchResult[]): string {
  const head = '| Scenario | req/s | p50 ms | p95 ms | p99 ms | non-2xx/304 | errors |\n|---|---:|---:|---:|---:|---:|---:|';
  const rows = results.map((r) => `| ${r.name} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.non2xx} | ${r.errors} |`);
  return [head, ...rows].join('\n');
}
