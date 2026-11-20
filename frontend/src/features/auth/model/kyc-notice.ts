import type { KycStatus } from '@/shared/contract';

export interface KycNotice {
  tone: 'warning' | 'info' | 'danger';
  title: string;
  body: string;
}

/** Strategy per KYC status. VERIFIED shows nothing; UNKNOWN keeps browsing explicitly available. */
const KYC_NOTICES: Record<KycStatus, KycNotice | null> = {
  VERIFIED: null,
  PENDING: {
    tone: 'info',
    title: 'Verification in progress',
    body: 'You can browse every Jameya. Reserving a seat unlocks once your identity check is approved.',
  },
  REJECTED: {
    tone: 'danger',
    title: 'Verification was not approved',
    body: 'You can still browse. To reserve seats, contact Pokunity support to review your documents.',
  },
  UNKNOWN: {
    tone: 'warning',
    title: 'Verification temporarily unavailable',
    body: 'Our identity service is unreachable right now. Browsing still works; reserving will be available again shortly.',
  },
};

export function kycNoticeFor(status: KycStatus): KycNotice | null {
  return KYC_NOTICES[status];
}
