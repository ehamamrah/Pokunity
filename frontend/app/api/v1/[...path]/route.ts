import type { NextRequest } from 'next/server';
import { proxyRequest } from '@/server/bff/proxy';

/** Read the backend URL at runtime, so this route is never statically cached. */
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
