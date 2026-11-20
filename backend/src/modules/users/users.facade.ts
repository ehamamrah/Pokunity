import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { Errors } from '../../shared/errors/app-error';
import { KycService } from './application/kyc.service';
import { maxActiveHolds } from './domain/hold-limit-policy';
import { isSeatRestricted } from './domain/risk-policy';
import { Eligibility, PersonalizationSignals, RiskTier, UserCredentials, UserProfile } from './domain/user.types';
import { UserRecord, UsersRepository } from './infrastructure/users.repository';

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
    const { id, name, email, riskTier, preferences } = await this.load(userId);
    return { id, name, email, riskTier, preferences };
  }

  async getEligibility(userId: string): Promise<Eligibility> {
    const [user, kyc] = await Promise.all([this.load(userId), this.kyc.getStatus(userId)]);
    return { kyc, riskTier: user.riskTier, maxActiveHolds: maxActiveHolds(user.expiredHoldsCount) };
  }

  /** Declared preference wins; otherwise the average monthly amount of confirmed history. */
  async getPersonalization(userId: string): Promise<PersonalizationSignals> {
    const user = await this.load(userId);
    const historyAvg = user.confirmedCount > 0 ? Math.round(user.confirmedMonthlyTotal / user.confirmedCount) : null;
    return {
      typicalMonthlyAmount: user.preferences.typicalMonthlyAmount ?? historyAvg,
      preferredDurations: user.preferences.preferredDurations,
      confirmedCount: user.confirmedCount,
    };
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
