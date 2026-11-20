import { ProviderKycStatus } from './domain/user.types';

/**
 * Port (hexagonal architecture) for the external KYC provider. The simulator adapter is bound
 * by default; a real vendor adapter only needs to implement this class.
 */
export abstract class KycProvider {
  abstract fetchStatus(userId: string): Promise<ProviderKycStatus>;
}
