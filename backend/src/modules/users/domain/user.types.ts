export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type KycStatus = 'VERIFIED' | 'PENDING' | 'REJECTED' | 'UNKNOWN';
export type ProviderKycStatus = Exclude<KycStatus, 'UNKNOWN'>;

export interface KycView {
  status: KycStatus;
  checkedAt: string | null;
  /** True when served from cache after a provider failure (stale-if-error). */
  stale: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  riskTier: RiskTier;
  preferences: { typicalMonthlyAmount?: number; preferredDurations: number[] };
}

export interface UserCredentials {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
}

export interface Eligibility {
  kyc: KycView;
  riskTier: RiskTier;
  maxActiveHolds: number;
}

/** Signals used by marketplace personalization (declared preferences + observed history). */
export interface PersonalizationSignals {
  typicalMonthlyAmount: number | null;
  preferredDurations: number[];
  confirmedCount: number;
}
