export interface DemoUser {
  email: string;
  name: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  kyc: 'VERIFIED' | 'PENDING';
  kycBehavior: 'NORMAL' | 'TIMEOUT';
  typicalMonthlyAmount: number;
  preferredDurations: number[];
  expiredHolds: number;
}

/** The five contract demo users (docs/api/README.md#seeded-demo-users). */
export const DEMO_USERS: DemoUser[] = [
  { email: 'sara@pokunity.app', name: 'Sara Al-Qahtani', riskTier: 'LOW', kyc: 'VERIFIED', kycBehavior: 'NORMAL', typicalMonthlyAmount: 100000, preferredDurations: [10, 12], expiredHolds: 0 },
  { email: 'omar@pokunity.app', name: 'Omar Al-Harbi', riskTier: 'LOW', kyc: 'PENDING', kycBehavior: 'NORMAL', typicalMonthlyAmount: 50000, preferredDurations: [6], expiredHolds: 0 },
  { email: 'lina@pokunity.app', name: 'Lina Al-Otaibi', riskTier: 'HIGH', kyc: 'VERIFIED', kycBehavior: 'NORMAL', typicalMonthlyAmount: 200000, preferredDurations: [12], expiredHolds: 0 },
  { email: 'khaled@pokunity.app', name: 'Khaled Al-Shehri', riskTier: 'MEDIUM', kyc: 'VERIFIED', kycBehavior: 'NORMAL', typicalMonthlyAmount: 150000, preferredDurations: [12, 24], expiredHolds: 6 },
  { email: 'noura@pokunity.app', name: 'Noura Al-Dosari', riskTier: 'LOW', kyc: 'VERIFIED', kycBehavior: 'TIMEOUT', typicalMonthlyAmount: 100000, preferredDurations: [12], expiredHolds: 0 },
];

export const DEMO_PASSWORD = 'Pokunity123!';
export const loadTestEmail = (n: number) => `loadtest+${n}@pokunity.app`;
