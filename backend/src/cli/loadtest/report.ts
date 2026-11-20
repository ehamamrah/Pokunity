import { Attempt } from './fire';

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

export function summarize(results: Attempt[], wallMs: number) {
  const byOutcome = new Map<string, number>();
  results.forEach((r) => byOutcome.set(`${r.status} ${r.code}`, (byOutcome.get(`${r.status} ${r.code}`) ?? 0) + 1));
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const latency = { p50: pct(latencies, 50), p95: pct(latencies, 95), p99: pct(latencies, 99), max: latencies.at(-1) ?? 0 };
  return { byOutcome, latency, wallMs, throughput: (results.length / wallMs) * 1000 };
}

export function printReport(title: string, s: ReturnType<typeof summarize>, checks: Record<string, number | boolean>): void {
  const fmt = (n: number) => n.toFixed(0).padStart(6);
  console.log(`\n=== ${title} ===`);
  console.log('outcome                                count');
  [...s.byOutcome.entries()].sort().forEach(([k, v]) => console.log(`${k.padEnd(38)} ${String(v).padStart(6)}`));
  console.log(`latency ms  p50 ${fmt(s.latency.p50)}  p95 ${fmt(s.latency.p95)}  p99 ${fmt(s.latency.p99)}  max ${fmt(s.latency.max)}`);
  console.log(`wall time ${s.wallMs.toFixed(0)} ms, throughput ${s.throughput.toFixed(0)} req/s`);
  console.log('invariants:');
  Object.entries(checks).forEach(([k, v]) => console.log(`  ${k.padEnd(36)} ${v}`));
}
