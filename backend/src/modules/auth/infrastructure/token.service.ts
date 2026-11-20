import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../../shared/config/app-config';
import { AuthenticatedUser } from '../../../shared/http/current-user.decorator';

interface Claims {
  sub: string;
  email: string;
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

  issue(user: AuthenticatedUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email } satisfies Claims, {
      expiresIn: this.ttlSeconds,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const claims = await this.jwt.verifyAsync<Claims>(token);
    return { id: claims.sub, email: claims.email };
  }
}
