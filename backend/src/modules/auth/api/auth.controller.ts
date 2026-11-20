import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../shared/http/public.decorator';
import { RateLimit, RateLimitGuard } from '../../../shared/http/rate-limit.guard';
import { AuthService, LoginResult } from '../application/auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'login', limit: 5, windowSeconds: 60, by: 'ip' })
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.email, body.password);
  }
}
