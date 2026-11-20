'use client';

import { Button } from '@/shared/ui';
import { useLogout } from '../api/use-session-mutations';

export function SessionMenu() {
  const logout = useLogout();
  return (
    <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
      {logout.isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
