import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Conditional, matchesIfNoneMatch } from './conditional';

/**
 * Conditional GET (README "Conditional requests"): handlers return a `Conditional`. This sets the
 * stable `ETag` and `X-As-Of` and answers `304 Not Modified` without rendering the body when the
 * client's `If-None-Match` matches. Otherwise the pre-serialised JSON is sent as-is.
 */
@Injectable()
export class ConditionalGetInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<Conditional>): Observable<string | undefined> {
    const http = context.switchToHttp();
    return next.handle().pipe(map((result) => respond(http.getRequest<Request>(), http.getResponse<Response>(), result)));
  }
}

function respond(req: Request, res: Response, result: Conditional): string | undefined {
  res.setHeader('ETag', result.etag);
  res.setHeader('X-As-Of', result.asOf.toISOString());
  if (matchesIfNoneMatch(req.header('if-none-match'), result.etag)) {
    res.status(304);
    return undefined;
  }
  res.type('application/json');
  return result.render();
}
