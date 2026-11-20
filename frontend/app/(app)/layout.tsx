import type { ReactNode } from 'react';
import { SessionMenu } from '@/features/auth';
import { SiteHeader } from '@/shared/ui';

/** Layout for every signed-in page: site header with navigation and sign-out. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader>
        <SessionMenu />
      </SiteHeader>
      <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
