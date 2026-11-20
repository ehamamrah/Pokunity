'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/shared/ui';
import { DEMO_PASSWORD, type DemoUser } from '../model/demo-users';
import { describeLoginError, describeSessionReason } from '../model/login-errors';
import type { LoginCredentials } from '../model/login-schema';
import { useLogin } from '../api/use-session-mutations';
import { DemoUserPicker } from './DemoUserPicker';
import { LoginForm } from './LoginForm';

interface LoginPanelProps {
  reason?: string;
  next: string;
}

/** Hook: sign-in state, with the submitted email kept for the screen-reader announcement. */
function useSignIn(next: string) {
  const router = useRouter();
  const [pickedEmail, setPickedEmail] = useState<string | null>(null);
  const login = useLogin(() => router.replace(next));
  const submit = (credentials: LoginCredentials) => {
    setPickedEmail(credentials.email);
    login.mutate(credentials);
  };
  const pick = (user: DemoUser) => submit({ email: user.email, password: DEMO_PASSWORD });
  const announcement = pickedEmail && login.isPending ? `Signing in as ${pickedEmail}` : '';
  return { login, submit, pick, announcement };
}

function SignInCard({ reason, login, submit }: { reason?: string; login: ReturnType<typeof useLogin>; submit: (c: LoginCredentials) => void }) {
  const sessionNotice = describeSessionReason(reason);
  return (
    <section aria-labelledby="signin-heading" className="space-y-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h1 id="signin-heading" className="text-xl font-semibold text-slate-900">Sign in to Pokunity</h1>
      {sessionNotice ? <Alert tone="info">{sessionNotice}</Alert> : null}
      <LoginForm pending={login.isPending} serverError={login.isError ? describeLoginError(login.error) : null} onSubmit={submit} />
    </section>
  );
}

/** Container: sign-in state, error copy, and navigation after success. */
export function LoginPanel({ reason, next }: LoginPanelProps) {
  const { login, submit, pick, announcement } = useSignIn(next);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <SignInCard reason={reason} login={login} submit={submit} />
      <DemoUserPicker disabled={login.isPending} onPick={pick} />
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
}
