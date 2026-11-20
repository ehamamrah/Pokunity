import { cookies } from 'next/headers';
import { createApiClient, NetworkError, type ApiClient, type HttpRequest, type HttpResponse, type HttpTransport } from '@/shared/api-client';
import { callBackend } from './backend-client';
import { SESSION_COOKIE } from './config';

function parseJson(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Transport for server components. It sends reads through the same breaker, keep-alive pool and
 * timeout as the proxy, so a server prefetch never bypasses resilience and never hangs a render.
 */
function bridgeTransport(token: string | undefined): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const headers = new Headers({ accept: 'application/json' });
      if (token) headers.set('authorization', `Bearer ${token}`);
      const outcome = await callBackend(request.url, { method: request.method, headers });
      if (outcome.kind !== 'response') throw new NetworkError('Backend unavailable during server prefetch');
      const responseHeaders = new Headers();
      outcome.response.headers.forEach((value, name) => responseHeaders.set(name, value));
      return { status: outcome.response.status, headers: responseHeaders, body: parseJson(await outcome.response.text()) };
    },
  };
}

/** Server-side client bound to the viewer's session cookie. Create one per request. */
export async function serverApiClient(): Promise<ApiClient> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return createApiClient({ baseUrl: '/api/v1', transport: bridgeTransport(token) });
}
