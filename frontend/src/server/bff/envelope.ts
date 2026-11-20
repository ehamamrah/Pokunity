import { NextResponse } from 'next/server';
import type { ApiErrorCode } from '@/shared/api-client';

/** Builds a contract-shaped error envelope for failures the BFF itself detects. */
export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details: null, traceId: requestId } },
    { status, headers: { 'x-request-id': requestId, ...extraHeaders } },
  );
}
