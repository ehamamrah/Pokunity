import { Controller, Get, Header, UseInterceptors } from '@nestjs/common';
import { Conditional, conditionalFromBody } from '../../shared/http/conditional';
import { ConditionalGetInterceptor } from '../../shared/http/conditional-get.interceptor';
import { AuthenticatedUser, CurrentUser } from '../../shared/http/current-user.decorator';
import { ReservationsFacade } from '../reservations/reservations.facade';
import { UsersFacade } from '../users/users.facade';

/**
 * GET /me is a read-model composition (profile + eligibility from users, active holds from
 * reservations). Living in its own module keeps users → reservations free of a dependency cycle.
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersFacade,
    private readonly reservations: ReservationsFacade,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @UseInterceptors(ConditionalGetInterceptor)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<Conditional> {
    const [{ profile, eligibility }, activeHolds] = await Promise.all([
      this.users.getViewer(user.id), this.reservations.activeHoldsCount(user.id),
    ]);
    const { id, name, email, riskTier, preferences } = profile;
    const limits = { maxActiveHolds: eligibility.maxActiveHolds, activeHolds };
    const body = { id, name, email, kycStatus: eligibility.kyc.status, kycCheckedAt: eligibility.kyc.checkedAt, riskTier, preferences, limits };
    return conditionalFromBody(body, new Date(), ['kycCheckedAt']); // a re-check alone is not a change
  }
}
