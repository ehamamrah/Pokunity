import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Errors } from '../../../shared/errors/app-error';
import { AuthenticatedRequest } from '../../../shared/http/current-user.decorator';
import { IS_PUBLIC } from '../../../shared/http/public.decorator';
import { TokenService } from './token.service';

/** Global guard: every route requires a valid Bearer JWT unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw Errors.unauthorized();
    req.user = await this.tokens.verify(token).catch(() => {
      throw Errors.unauthorized();
    });
    return true;
  }
}
