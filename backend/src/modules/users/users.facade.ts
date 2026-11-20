import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { Errors } from '../../shared/errors/app-error';
import { KycService } from './application/kyc.service';
import { maxActiveHolds } from './domain/hold-limit-policy';
import { isSeatRestricted } from './domain/risk-policy';
import { Eligibility, PersonalizationSignals, RiskTier, UserCredentials, UserProfile } from './domain/user.types';
import { UserRecord, UsersRepository } from './infrastructure/users.repository';

export interface ViewerProfile {
  profile: UserProfile;
  eligibility: Eligibility;
  personalization: PersonalizationSignals;
}

function toProfile({ id, name, email, riskTier, preferences }: UserRecord): UserProfile {
  return { id, name, email, riskTier, preferences };
}

/** Declared preference wins; otherwise the average monthly amount of confirmed history. */
function toPersonalization(user: UserRecord): PersonalizationSignals {
  const historyAvg = user.confirmedCount > 0 ? Math.round(user.confirmedMonthlyTotal / user.confirmedCount) : null;
  return {
    typicalMonthlyAmount: user.preferences.typicalMonthlyAmount ?? historyAvg,
    preferredDurations: user.preferences.preferredDurations,
    confirmedCount: user.confirmedCount,
  };
}

/** Public API (Facade) of the users module. Other modules never touch users tables directly. */
@Injectable()
export class UsersFacade {
  constructor(
    private readonly repository: UsersRepository,
    private readonly kyc: KycService,
  ) {}

  findCredentials(email: string): Promise<UserCredentials | null> {
    return this.repository.findCredentialsByEmail(email);
  }

  async getProfile(userId: string): Promise<UserProfile> {
    return toProfile(await this.load(userId));
  }

  async getEligibility(userId: string): Promise<Eligibility> {
    const [user, kyc] = await Promise.all([this.load(userId), this.kyc.getStatus(userId)]);
    return { kyc, riskTier: user.riskTier, maxActiveHolds: maxActiveHolds(user.expiredHoldsCount) };
  }

  async getPersonalization(userId: string): Promise<PersonalizationSignals> {
    return toPersonalization(await this.load(userId));
  }

  /** Everything a read page needs about the viewer in ONE user query (+ cached KYC, stale-while-revalidate). */
  async getViewer(userId: string): Promise<ViewerProfile> {
    const [user, kyc] = await Promise.all([this.load(userId), this.kyc.getStatus(userId, { allowStale: true })]);
    const eligibility = { kyc, riskTier: user.riskTier, maxActiveHolds: maxActiveHolds(user.expiredHoldsCount) };
    return { profile: toProfile(user), eligibility, personalization: toPersonalization(user) };
  }

  isSeatRestricted(tier: RiskTier, seatNumber: number, totalSeats: number): boolean {
    return isSeatRestricted(tier, seatNumber, totalSeats);
  }

  recordExpiredHolds(executor: SqlExecutor, userIds: string[]): Promise<void> {
    return userIds.length ? this.repository.incrementExpiredHolds(executor, userIds) : Promise.resolve();
  }

  recordConfirmedReservation(executor: SqlExecutor, userId: string, monthlyAmount: number): Promise<void> {
    return this.repository.recordConfirmed(executor, userId, monthlyAmount);
  }

  kycHealth(): 'up' | 'degraded' {
    return this.kyc.providerHealth;
  }

  private async load(userId: string): Promise<UserRecord> {
    const user = await this.repository.findById(userId);
    if (!user) throw Errors.unauthorized();
    return user;
  }
}
