'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui';
import { loginFormSchema, type LoginCredentials } from '../model/login-schema';

interface LoginFormProps {
  pending: boolean;
  serverError: string | null;
  onSubmit: (credentials: LoginCredentials) => void;
}

interface FieldProps {
  id: string;
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}

function Field({ id, label, type, autoComplete, value, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
    </div>
  );
}

/** Hook: field values and client-side validation, which mirrors the contract. The server stays the authority. */
function useLoginForm(onSubmit: (credentials: LoginCredentials) => void) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = loginFormSchema.safeParse(values);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
      return;
    }
    setFieldError(null);
    onSubmit(parsed.data);
  };
  return { values, setValues, fieldError, submit };
}

export function LoginForm({ pending, serverError, onSubmit }: LoginFormProps) {
  const emailId = useId();
  const passwordId = useId();
  const { values, setValues, fieldError, submit } = useLoginForm(onSubmit);
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id={emailId} label="Email" type="email" autoComplete="username" value={values.email} onChange={(email) => setValues({ ...values, email })} />
      <Field id={passwordId} label="Password" type="password" autoComplete="current-password" value={values.password} onChange={(password) => setValues({ ...values, password })} />
      <p role="alert" className="min-h-5 text-sm text-rose-700">{fieldError ?? serverError ?? ''}</p>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}
