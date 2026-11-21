import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser, SessionClaims } from '../../../shared/http/current-user.decorator';
import { AuditFacade } from '../../audit/audit.facade';
import { UsersFacade } from '../../users/users.facade';
import { SessionVersionCache } from '../infrastructure/session-version.cache';
import { TokenDenylist } from '../infrastructure/token-denylist';

/**
 * Logout (v1.1). This session: jti → Redis denylist until the token expires. All sessions: bump the
 * member's token version in PostgreSQL. If the denylist is unavailable, a single-session logout is
 * ESCALATED to "all sessions": revoking more than asked is safe, silently revoking nothing is not.
 */
@Injectable()
export class LogoutService {
  private readonly logger = new Logger(LogoutService.name);

  constructor(
    private readonly denylist: TokenDenylist,
    private readonly users: UsersFacade,
    private readonly versions: SessionVersionCache,
    private readonly audit: AuditFacade,
  ) {}

  async logout(user: AuthenticatedUser, session: SessionClaims, allSessions: boolean): Promise<void> {
    const revokedOne = !allSessions && session.jti ? await this.denylist.revoke(session.jti, session.exp) : false;
    const scope = revokedOne ? 'session' : 'all_sessions';
    if (!revokedOne) await this.revokeAll(user.id, allSessions);
    await this.audit.record({ actor: user.id, action: `auth.logout.${scope}`, entityType: 'user', entityId: user.id });
  }

  private async revokeAll(userId: string, requested: boolean): Promise<void> {
    if (!requested) this.logger.warn({ msg: 'denylist unavailable, logout escalated to all sessions', userId });
    this.versions.remember(userId, await this.users.revokeAllSessions(userId));
  }
}
