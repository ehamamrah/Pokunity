import { Alert } from '@/shared/ui';

/** Shown while the server is still authorizing. Explicitly not a success message. */
export function PayingNotice() {
  return (
    <Alert tone="info" title="Confirming your payment">
      The provider is authorizing the payment. This can take a few seconds. We will show the result here as soon as the server confirms it, and you can keep checking on My reservations.
    </Alert>
  );
}
