'use client';

import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/shared/ui';
import { useLogout } from '../api/use-session-mutations';

const ITEM_CLASS = 'w-full rounded-lg px-3 py-2 text-start text-sm disabled:text-slate-400';

function MenuItem({ label, tone, disabled, onSelect }: { label: string; tone: 'default' | 'danger'; disabled: boolean; onSelect: () => void }) {
  const toneClass = tone === 'danger' ? 'text-rose-800 hover:bg-rose-50' : 'hover:bg-slate-100';
  return (
    <li role="none">
      <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className={`${ITEM_CLASS} ${toneClass}`}>
        {label}
      </button>
    </li>
  );
}

interface MenuItemsProps {
  pending: boolean;
  onLogout: (allSessions: boolean) => void;
  onEscape: (event: KeyboardEvent<HTMLElement>) => void;
}

function MenuItems({ pending, onLogout, onEscape }: MenuItemsProps) {
  return (
    <ul id="account-menu" role="menu" aria-label="Account" onKeyDown={onEscape} className="absolute end-0 z-10 mt-2 w-64 space-y-1 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
      <MenuItem label="Log out" tone="default" disabled={pending} onSelect={() => onLogout(false)} />
      <MenuItem label="Log out of all devices" tone="danger" disabled={pending} onSelect={() => onLogout(true)} />
    </ul>
  );
}

/** Account menu: sign out here, or revoke every session of this member. Escape closes it. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const logout = useLogout();
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') setOpen(false);
  };
  return (
    <div className="relative">
      <Button variant="ghost" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onKeyDown={closeOnEscape} onClick={() => setOpen(!open)}>
        {logout.isPending ? 'Signing out…' : 'Account'}
      </Button>
      {open ? <MenuItems pending={logout.isPending} onLogout={(all) => logout.mutate(all)} onEscape={closeOnEscape} /> : null}
    </div>
  );
}
