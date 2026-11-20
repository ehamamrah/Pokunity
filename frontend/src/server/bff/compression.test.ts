import { expect, it } from 'vitest';
import { acceptsGzip, gzipStream, isCompressible } from './compression';

it.each(['gzip, deflate, br', 'GZIP'])('recognises gzip in Accept-Encoding "%s"', (value) => {
  expect(acceptsGzip(value)).toBe(true);
});

it.each([null, 'identity', 'br'])('does not gzip for Accept-Encoding %s', (value) => {
  expect(acceptsGzip(value)).toBe(false);
});

it.each([['application/json; charset=utf-8', true], ['text/html', true], ['image/png', false], [null, false]] as const)(
  'marks %s compressible=%s',
  (type, expected) => {
    expect(isCompressible(type)).toBe(expected);
  },
);

it('round-trips the body byte-for-byte through gzip', async () => {
  const original = JSON.stringify({ data: Array.from({ length: 50 }, (_, index) => ({ index, name: 'Riyadh Savers' })) });
  const source = new Response(original).body;
  if (!source) throw new Error('expected a body stream');
  const compressed = gzipStream(source);
  const decompress = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
  const restored = await new Response(compressed.pipeThrough(decompress)).text();
  expect(restored).toBe(original);
});
