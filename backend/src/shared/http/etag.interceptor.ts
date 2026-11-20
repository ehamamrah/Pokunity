import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Conditional GET for read endpoints: serialises the body ONCE, derives a weak ETag from it and
 * answers `304 Not Modified` (no body) when the client's `If-None-Match` matches. The serialised
 * string is sent as-is, so Express does not serialise the object a second time.
 */
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    return next.handle().pipe(map((body) => respond(http.getRequest<Request>(), http.getResponse<Response>(), body)));
  }
}

function respond(req: Request, res: Response, body: unknown): string | undefined {
  const json = JSON.stringify(body);
  const etag = `W/"${createHash('sha1').update(json).digest('base64url')}"`;
  res.setHeader('ETag', etag);
  if (req.header('if-none-match') === etag) {
    res.status(304);
    return undefined;
  }
  res.type('application/json');
  return json;
}
