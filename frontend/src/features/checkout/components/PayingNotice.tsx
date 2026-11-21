import { Alert } from '@/shared/ui';
import { resolveByLabel } from '../model/resolve-by';

/** Shown while the server is still authorizing. Explicitly not a success message; with a deadline it says when the answer is guaranteed. */
export function PayingNotice({ resolveBy }: { resolveBy: string | null | undefined }) {
  const by = resolveByLabel(resolveBy);
  return (
    <Alert tone="info" title="Confirming your payment">
      {by
        ? `Still confirming. You will have the result by ${by} at the latest. You can keep checking on My reservations, and nothing is charged until the seat is confirmed.`
        : 'The provider is authorizing the payment. This can take a few seconds. We will show the result here as soon as the server confirms it, and you can keep checking on My reservations.'}
    </Alert>
  );
}
