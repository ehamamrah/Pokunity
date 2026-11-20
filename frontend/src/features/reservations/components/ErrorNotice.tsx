'use client';

import Link from 'next/link';
import { Alert, Button } from '@/shared/ui';
import type { ErrorPresentation, RecoveryAction } from '../model/error-strategy';

interface ActionHandlers {
  onRefresh: () => void;
  onRetry: () => void;
}

/** Renders the recovery step the error strategy chose. Every error gets a next step, never just a message. */
function RecoveryControl({ action, onRefresh, onRetry }: { action: RecoveryAction } & ActionHandlers) {
  switch (action.kind) {
    case 'link':
      return <Link href={action.href} className="text-sm font-semibold text-teal-900 underline">{action.label}</Link>;
    case 'refresh':
      return <Button variant="secondary" onClick={onRefresh}>Refresh and choose again</Button>;
    case 'retry':
      return <Button variant="secondary" onClick={onRetry}>Try again</Button>;
    case 'wait':
      return <p className="text-sm">You can try again in about {action.seconds} seconds.</p>;
    default:
      return null;
  }
}

interface ErrorNoticeProps extends ActionHandlers {
  error: ErrorPresentation;
}

/** Alert with the message, a trace reference for support, and the recovery control. */
export function ErrorNotice({ error, onRefresh, onRetry }: ErrorNoticeProps) {
  return (
    <Alert tone="danger" title={error.title}>
      <p>{error.message}</p>
      {error.reference ? <p className="mt-2 text-xs opacity-80">Reference: {error.reference}</p> : null}
      <div className="mt-3">
        <RecoveryControl action={error.action} onRefresh={onRefresh} onRetry={onRetry} />
      </div>
    </Alert>
  );
}
