/** Streaming gzip for compressible responses. Bodies are piped, never buffered, so memory stays flat. */

export function acceptsGzip(acceptEncoding: string | null): boolean {
  return acceptEncoding?.toLowerCase().includes('gzip') ?? false;
}

const COMPRESSIBLE_TYPES = /^(application\/json|text\/)/i;

export function isCompressible(contentType: string | null): boolean {
  return contentType !== null && COMPRESSIBLE_TYPES.test(contentType);
}

/** The DOM lib types the writable side as BufferSource; the runtime accepts Uint8Array chunks. */
export function bytesTransform(format: 'gzip' | 'deflate'): TransformStream<Uint8Array, Uint8Array> {
  return (format === 'gzip' ? new CompressionStream('gzip') : new CompressionStream('deflate')) as unknown as TransformStream<Uint8Array, Uint8Array>;
}

/** Pipes the body through a gzip CompressionStream. Callers set Content-Encoding and Vary. */
export function gzipStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return body.pipeThrough(bytesTransform('gzip'));
}
