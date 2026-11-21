import { expect, it } from 'vitest';
import { headerAsOf, withMetaAsOf, withTopLevelAsOf } from './freshness';

const BODY_ASOF = '2026-11-21T10:00:00.000Z';
const HEADER_ASOF = '2026-11-21T10:00:09.000Z';

it('reads X-As-Of when it is a valid timestamp', () => {
  expect(headerAsOf(new Headers({ 'x-as-of': HEADER_ASOF }))).toBe(HEADER_ASOF);
});

it('ignores a missing or malformed X-As-Of', () => {
  expect(headerAsOf(new Headers())).toBeNull();
  expect(headerAsOf(new Headers({ 'x-as-of': 'yesterday' }))).toBeNull();
});

it('refreshes the list envelope from the header, keeping the items as they were', () => {
  const item = { id: 'a' };
  const body = { data: [item], meta: { page: 1, asOf: BODY_ASOF } };
  const result = withMetaAsOf(body, new Headers({ 'x-as-of': HEADER_ASOF }));
  expect(result.meta.asOf).toBe(HEADER_ASOF);
  expect(result.data[0]).toBe(item);
});

it('keeps the body asOf when the header is absent', () => {
  const body = { data: [], meta: { page: 1, asOf: BODY_ASOF } };
  expect(withMetaAsOf(body, new Headers()).meta.asOf).toBe(BODY_ASOF);
});

it('refreshes a detail body with a top-level asOf', () => {
  expect(withTopLevelAsOf({ id: 'x', asOf: BODY_ASOF }, new Headers({ 'x-as-of': HEADER_ASOF })).asOf).toBe(HEADER_ASOF);
});
