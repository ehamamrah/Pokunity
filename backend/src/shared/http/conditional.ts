import { createHash } from 'node:crypto';

/**
 * A cacheable read result whose ETag is known BEFORE (or without) rendering the body.
 * `render` returns the final JSON string and is only called when the client's copy is stale.
 */
export interface Conditional {
  readonly etag: string;
  /** When the server last verified the data (sent as X-As-Of on 200 and 304). */
  readonly asOf: Date;
  render(): string;
}

export function weakEtag(input: string): string {
  return `W/"${createHash('sha1').update(input).digest('base64url')}"`;
}

/**
 * ETag from a list of inputs that fully determine the response (no rendering needed to compare).
 * Callers must include EVERY input that can change what the viewer sees.
 */
export function conditionalFromInputs(inputs: unknown[], asOf: Date, render: () => unknown): Conditional {
  return { etag: weakEtag(JSON.stringify(inputs)), asOf, render: () => JSON.stringify(render()) };
}

/**
 * ETag from the body itself minus volatile top-level fields (e.g. `asOf`, `kycCheckedAt`).
 * The body is serialised once; volatile fields are appended to the same string for the response.
 */
export function conditionalFromBody(body: object, asOf: Date, volatileKeys: string[] = []): Conditional {
  const entries = Object.entries(body);
  const stableJson = JSON.stringify(Object.fromEntries(entries.filter(([k]) => !volatileKeys.includes(k))));
  const volatile = entries.filter(([k]) => volatileKeys.includes(k)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const separator = stableJson.length > 2 && volatile.length > 0 ? ',' : '';
  const full = volatile.length === 0 ? stableJson : `${stableJson.slice(0, -1)}${separator}${volatile.join(',')}}`;
  return { etag: weakEtag(stableJson), asOf, render: () => full };
}

/** Weak comparison (RFC 9110 §8.8.3.2) against an If-None-Match header (list or `*`). */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const strip = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => candidate.trim() === '*' || strip(candidate) === strip(etag));
}
