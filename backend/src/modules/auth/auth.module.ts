import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../shared/config/app-config';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { LogoutService } from './application/logout.service';
import { SessionVersionCache } from './infrastructure/session-version.cache';
import { TokenDenylist } from './infrastructure/token-denylist';
import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
import { TokenService } from './infrastructure/token.service';

/**
 * Owns no tables (the jti denylist lives in Redis; token_version is a users column behind UsersFacade).
 * Authenticates, issues and revokes JWTs, installs the global auth guard.
 */
@Module({
  imports: [
    UsersModule,
    AuditModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.env.JWT_SECRET, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, LogoutService, TokenService, TokenDenylist, SessionVersionCache,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
