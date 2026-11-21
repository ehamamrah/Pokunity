/**
 * `X-As-Of` is the moment the server last verified a read. It is sent on 200 and 304 alike, so a
 * revalidated response refreshes the freshness indicator even when the body (and its embedded
 * `asOf`) is unchanged. The body value remains the fallback.
 */
export function headerAsOf(headers: Headers): string | null {
  const value = headers.get('x-as-of');
  return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** For bodies shaped `{ meta: { asOf } }` (lists, featured, similar). Only the envelope changes, never the items. */
export function withMetaAsOf<T extends { meta: { asOf: string } }>(body: T, headers: Headers): T {
  const asOf = headerAsOf(headers);
  return asOf === null ? body : { ...body, meta: { ...body.meta, asOf } };
}

/** For bodies shaped `{ asOf }` (a Jameya detail). */
export function withTopLevelAsOf<T extends { asOf: string }>(body: T, headers: Headers): T {
  const asOf = headerAsOf(headers);
  return asOf === null ? body : { ...body, asOf };
}
