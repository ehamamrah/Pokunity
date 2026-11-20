import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/bff/config';
import { MOCKING_ENABLED } from '@/shared/config/env';

/**
 * Route guard. A missing session cookie sends the user to /login (keeping the destination).
 * A present cookie on /login skips straight to the marketplace. The BFF enforces auth on
 * every API call; this only decides which pages the user sees.
 */
export function middleware(request: NextRequest): NextResponse {
  if (MOCKING_ENABLED) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === '/login') {
    return hasSession ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|mockServiceWorker.js).*)'],
};
