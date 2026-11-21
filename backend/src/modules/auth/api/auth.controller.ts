import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { SessionPolicy } from '../../../shared/http/public.decorator';
import { Public } from '../../../shared/http/public.decorator';
import { RateLimits } from '../../../shared/http/rate-limit/policies';
import { RateLimit, RateLimitGuard } from '../../../shared/http/rate-limit/rate-limit.guard';
import { AuthService, LoginResult } from '../application/auth.service';
import { LogoutService } from '../application/logout.service';
import { LogoutDto } from './dto/logout.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly logouts: LogoutService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimits.loginPerIp, RateLimits.loginPerEmail)
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.email, body.password);
  }

  /** 204 always (idempotent): an already revoked token is accepted here and revoked again. */
  @Post('logout')
  @HttpCode(204)
  @SessionPolicy('allow-revoked')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimits.logout)
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: AuthenticatedRequest, @Body() body: LogoutDto): Promise<void> {
    await this.logouts.logout(user, req.session as NonNullable<AuthenticatedRequest['session']>, body.allSessions === true);
  }
}
