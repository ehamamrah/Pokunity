import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { UsersFacade } from '../../users/users.facade';
import { TokenService } from '../infrastructure/token.service';

// Compared against when the email is unknown so that response time does not leak account existence.
const DUMMY_HASH = bcrypt.hashSync('pokunity-timing-equalizer', 10);

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersFacade,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findCredentials(email);
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    }
    const accessToken = await this.tokens.issue({ id: user.id, email: user.email }, user.tokenVersion);
    return { accessToken, expiresIn: this.tokens.ttlSeconds, user: { id: user.id, name: user.name, email: user.email } };
  }
}
