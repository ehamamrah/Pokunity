import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '../config/routes';

const LINK_CLASS = 'hover:text-teal-800';

export function Brand() {
  return (
    <Link prefetch={false} href={ROUTES.home} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-teal-600">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-teal-700 font-bold text-white">P</span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-slate-900">Pokunity</span>
        <span className="block text-[11px] text-slate-500">Pocket Community</span>
      </span>
    </Link>
  );
}

function PrimaryNav() {
  return (
    <nav aria-label="Primary" className="hidden gap-4 text-sm font-medium text-slate-700 sm:flex">
      <Link prefetch={false} className={LINK_CLASS} href={ROUTES.home}>Marketplace</Link>
      <Link prefetch={false} className={LINK_CLASS} href={ROUTES.reservations}>My reservations</Link>
    </nav>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Primary mobile" className="flex gap-4 border-t border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 sm:hidden">
      <Link prefetch={false} href={ROUTES.home}>Marketplace</Link>
      <Link prefetch={false} href={ROUTES.reservations}>My reservations</Link>
    </nav>
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Brand />
          <PrimaryNav />
        </div>
        {children}
      </div>
      <MobileNav />
    </header>
  );
}
