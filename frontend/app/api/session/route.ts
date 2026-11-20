import type { NextRequest } from 'next/server';
import { handleLogin, handleLogout } from '@/server/bff/session';

export const dynamic = 'force-dynamic';

export const POST = (request: NextRequest) => handleLogin(request);
export const DELETE = (request: NextRequest) => handleLogout(request);
