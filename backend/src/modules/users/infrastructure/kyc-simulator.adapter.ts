import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { ProviderKycStatus } from '../domain/user.types';
import { KycProvider } from '../kyc-provider.port';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HANG_MS = 30_000;

/**
 * Adapter: in-process stand-in for a third-party KYC API. Adds 40–160 ms latency; profiles with
 * behavior TIMEOUT (noura@pokunity.app) hang far beyond the client timeout.
 */
@Injectable()
export class KycSimulatorAdapter extends KycProvider {
  constructor(private readonly db: Database) {
    super();
  }

  async fetchStatus(userId: string): Promise<ProviderKycStatus> {
    const { rows } = await this.db.query<{ status: ProviderKycStatus; behavior: string }>(
      'SELECT status, behavior FROM kyc_simulator_profiles WHERE user_id = $1',
      [userId],
    );
    const profile = rows[0] ?? { status: 'PENDING', behavior: 'NORMAL' };
    await sleep(profile.behavior === 'TIMEOUT' ? HANG_MS : 40 + Math.random() * 120);
    if (profile.behavior === 'TIMEOUT') throw new Error('kyc provider did not respond');
    return profile.status;
  }
}
