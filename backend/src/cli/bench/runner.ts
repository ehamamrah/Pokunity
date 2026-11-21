import autocannon from 'autocannon';
import { Scenario } from './scenarios';
import { BenchResult, toResult } from './stats';

export interface RunOptions {
  baseUrl: string;
  connections: number;
  seconds: number;
  tokens: string[];
  /** Extra headers (e.g. If-None-Match for revalidation scenarios). */
  headers?: Record<string, string>;
}

let counter = 0;
/** Rotates members (per-user limits) and client IPs (an LB would set X-Forwarded-For per client). */
function headersFor(tokens: string[]): Record<string, string> {
  counter += 1;
  const ip = `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
  return { authorization: `Bearer ${tokens[counter % tokens.length]}`, 'x-forwarded-for': ip, 'content-type': 'application/json' };
}

export function runScenario(s: Scenario, o: RunOptions): Promise<BenchResult> {
  const latencies: number[] = [];
  let non2xx = 0;
  const onResponse = (_c: unknown, status: number, _b: number, ms: number) => {
    latencies.push(Math.round(ms));
    if ((status < 200 || status > 299) && status !== 304) non2xx += 1;
  };
  return new Promise((resolve) => {
    const instance = autocannon(options(s, o), (_err, r) =>
      resolve(toResult(s.name, latencies, o.seconds, non2xx, r?.errors ?? 0)));
    instance.on('response', onResponse);
  });
}

function options(s: Scenario, o: RunOptions): autocannon.Options {
  const setupRequest = (req: autocannon.Request) => ({ ...req, headers: { ...headersFor(o.tokens), ...o.headers }, body: s.body?.() });
  return { url: o.baseUrl, connections: o.connections, duration: o.seconds, requests: [{ method: s.method, path: s.path, setupRequest }] };
}
