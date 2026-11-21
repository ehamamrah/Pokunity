import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../shared/config/app-config';
import { AuthenticatedUser, SessionClaims } from '../../../shared/http/current-user.decorator';

interface Claims {
  sub: string;
  email: string;
  /** Unique token id: single-session logout puts it on the denylist. */
  jti?: string;
  /** Member's token version at issue time: "log out everywhere" bumps it. */
  ver?: number;
  exp: number;
}

export interface VerifiedToken {
  user: AuthenticatedUser;
  session: SessionClaims;
}

/** Issues and verifies HS256 access tokens (TTL from JWT_TTL_SECONDS, default 1h). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get ttlSeconds(): number {
    return this.config.env.JWT_TTL_SECONDS;
  }

  issue(user: AuthenticatedUser, tokenVersion = 0): Promise<string> {
    const claims = { sub: user.id, email: user.email, jti: randomUUID(), ver: tokenVersion };
    return this.jwt.signAsync(claims, { expiresIn: this.ttlSeconds });
  }

  /** Tokens minted before v1.1 have no jti/ver: they count as version 0 and cannot be denylisted. */
  async verify(token: string): Promise<VerifiedToken> {
    const c = await this.jwt.verifyAsync<Claims>(token);
    return { user: { id: c.sub, email: c.email }, session: { jti: c.jti ?? null, ver: c.ver ?? 0, exp: c.exp } };
  }
}
