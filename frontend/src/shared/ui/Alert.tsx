import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { TONE_CLASSES, type Tone } from './cx';

export interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  live?: 'assertive' | 'polite';
}

/** Alerts are announced: danger uses role=alert (assertive), others role=status (polite). */
export function Alert({ tone = 'info', title, children, action, live }: AlertProps) {
  const role = tone === 'danger' ? 'alert' : 'status';
  return (
    <div
      role={role}
      aria-live={live ?? (tone === 'danger' ? 'assertive' : 'polite')}
      className={cn('rounded-xl p-4 text-sm ring-1 ring-inset', TONE_CLASSES[tone])}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? 'mt-1' : '')}>{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
