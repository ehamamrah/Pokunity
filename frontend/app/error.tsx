'use client';

import { Alert, Button } from '@/shared/ui';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <Alert tone="danger" title="Something went wrong">
        <p>We hit an unexpected problem. Your reservations are not affected.</p>
        <div className="mt-4">
          <Button onClick={reset}>Try again</Button>
        </div>
      </Alert>
    </main>
  );
}
