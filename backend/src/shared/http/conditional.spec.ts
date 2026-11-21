import { conditionalFromBody, conditionalFromInputs, matchesIfNoneMatch } from './conditional';

test('body ETag ignores volatile fields but the rendered JSON keeps them', () => {
  const a = conditionalFromBody({ id: 1, asOf: '2026-11-21T10:00:00.000Z' }, new Date(), ['asOf']);
  const b = conditionalFromBody({ id: 1, asOf: '2026-11-21T10:00:05.000Z' }, new Date(), ['asOf']);
  expect(a.etag).toBe(b.etag);
  expect(JSON.parse(b.render())).toEqual({ id: 1, asOf: '2026-11-21T10:00:05.000Z' });
});

test('body ETag changes when visible content changes', () => {
  const a = conditionalFromBody({ seatsAvailable: 3 }, new Date());
  const b = conditionalFromBody({ seatsAvailable: 2 }, new Date());
  expect(a.etag).not.toBe(b.etag);
});

test('a body made only of volatile fields still renders valid JSON', () => {
  expect(JSON.parse(conditionalFromBody({ asOf: 'x' }, new Date(), ['asOf']).render())).toEqual({ asOf: 'x' });
});

test('input-derived ETag does not call render to compare', () => {
  const render = jest.fn(() => ({ big: true }));
  const c = conditionalFromInputs(['hash', 'treatment', 1], new Date(), render);
  expect(c.etag).toBe(conditionalFromInputs(['hash', 'treatment', 1], new Date(), render).etag);
  expect(render).not.toHaveBeenCalled();
});

test('If-None-Match uses weak comparison and supports lists and *', () => {
  expect(matchesIfNoneMatch('W/"abc"', 'W/"abc"')).toBe(true);
  expect(matchesIfNoneMatch('"abc"', 'W/"abc"')).toBe(true);
  expect(matchesIfNoneMatch('W/"x", W/"abc"', 'W/"abc"')).toBe(true);
  expect(matchesIfNoneMatch('*', 'W/"abc"')).toBe(true);
  expect(matchesIfNoneMatch('W/"other"', 'W/"abc"')).toBe(false);
  expect(matchesIfNoneMatch(undefined, 'W/"abc"')).toBe(false);
});
