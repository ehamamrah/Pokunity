import { LoginPanel } from '@/features/auth';
import { safeNextPath } from '@/shared/config/routes';
import { Brand } from '@/shared/ui';

interface LoginPageProps {
  searchParams: Promise<{ reason?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Brand />
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <LoginPanel reason={params.reason} next={safeNextPath(params.next)} />
      </main>
    </div>
  );
}
