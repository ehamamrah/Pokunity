import { NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

/** Port of the adapter: the client depends on this, never on fetch directly. */
export interface HttpTransport {
  send(request: HttpRequest): Promise<HttpResponse>;
}

// Looked up lazily so MSW (which patches globalThis.fetch on listen) intercepts calls.
const lazyFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toInit(request: HttpRequest): RequestInit {
  return {
    method: request.method,
    headers: request.headers,
    body: request.body,
    keepalive: request.keepalive,
    signal: request.signal,
    credentials: 'same-origin',
    // Reads may use the browser HTTP cache and conditional requests (Cache-Control, ETag).
    // Writes never do.
    cache: request.method === 'GET' ? 'default' : 'no-store',
  };
}

export function createFetchTransport(fetchImpl: typeof fetch = lazyFetch): HttpTransport {
  return {
    async send(request) {
      let response: Response;
      try {
        response = await fetchImpl(request.url, toInit(request));
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        throw new NetworkError();
      }
      return { status: response.status, headers: response.headers, body: await readBody(response) };
    },
  };
}
