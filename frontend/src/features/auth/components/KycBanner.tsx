'use client';

import { Alert } from '@/shared/ui';
import { useMe } from '../api/use-me';
import { kycNoticeFor } from '../model/kyc-notice';

/** Shows only when eligibility needs attention. Browsing is never blocked by this banner. */
export function KycBanner() {
  const me = useMe();
  const notice = me.data ? kycNoticeFor(me.data.kycStatus) : null;
  if (!notice) return null;
  return (
    <Alert tone={notice.tone} title={notice.title}>
      {notice.body}
    </Alert>
  );
}
