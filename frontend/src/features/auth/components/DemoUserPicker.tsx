import { Button } from '@/shared/ui';
import { DEMO_USERS, type DemoUser } from '../model/demo-users';

interface DemoUserPickerProps {
  disabled: boolean;
  onPick: (user: DemoUser) => void;
}

function DemoUserRow({ user, disabled, onPick }: { user: DemoUser } & Omit<DemoUserPickerProps, 'onPick'> & { onPick: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{user.name}</p>
        <p className="text-xs text-slate-600">{user.demonstrates}</p>
      </div>
      <Button variant="secondary" disabled={disabled} onClick={onPick} aria-label={`Sign in as ${user.name}, ${user.email}`}>
        Sign in
      </Button>
    </li>
  );
}

/** Quick-pick sign-in for the five seeded accounts; each card says what it demonstrates. */
export function DemoUserPicker({ disabled, onPick }: DemoUserPickerProps) {
  return (
    <section aria-labelledby="demo-heading" className="space-y-3">
      <div>
        <h2 id="demo-heading" className="text-sm font-semibold text-slate-900">Demo accounts</h2>
        <p className="text-xs text-slate-500">Choose an account to sign in instantly. Each one shows a different path.</p>
      </div>
      <ul className="grid gap-2">
        {DEMO_USERS.map((user) => (
          <DemoUserRow key={user.email} user={user} disabled={disabled} onPick={() => onPick(user)} />
        ))}
      </ul>
    </section>
  );
}
