'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNow } from '@/shared/lib/use-now';
import { Alert, EmptyState, SkeletonCards } from '@/shared/ui';
import { useReservations } from '../api/use-reservations';
import { RESERVATION_PAGE_SIZE } from '../api/reservation-repository';
import { groupReservations, type ReservationGroups } from '../model/status';
import { Pager } from './Pager';
import { ReservationGroup } from './ReservationGroup';

const BROWSE_LINK = 'inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800';

function GroupedList({ groups, nowMs }: { groups: ReservationGroups; nowMs: number | null }) {
  return (
    <div className="space-y-8">
      <ReservationGroup id="active-heading" heading="Active" items={groups.active} nowMs={nowMs} />
      <ReservationGroup id="confirmed-heading" heading="Confirmed" items={groups.confirmed} nowMs={nowMs} />
      <ReservationGroup id="past-heading" heading="Past" items={groups.past} nowMs={nowMs} />
    </div>
  );
}

/** Hook: the current page from the URL, and a setter that keeps the rest of the URL. */
function usePageParam(): { page: number; setPage: (page: number) => void } {
  const params = useSearchParams();
  const router = useRouter();
  const requested = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const setPage = (next: number) => {
    const query = new URLSearchParams(params.toString());
    query.set('page', String(next));
    router.replace(`/reservations?${query.toString()}`, { scroll: false });
  };
  return { page, setPage };
}

function NoReservations() {
  return <EmptyState title="No reservations yet" action={<Link href="/" className={BROWSE_LINK}>Browse Jameyas</Link>}>When you hold a seat, it appears here with its countdown and payment status.</EmptyState>;
}

function PageBody({ page, setPage }: { page: number; setPage: (page: number) => void }) {
  const query = useReservations(page);
  const nowMs = useNow(1_000);
  const items = useMemo(() => query.data?.data ?? [], [query.data]);
  const groups = useMemo(() => groupReservations(items), [items]);
  if (query.isPending) return <SkeletonCards count={2} />;
  if (query.isError) return <Alert tone="danger" title="We could not load your reservations">Check your connection and try again.</Alert>;
  if (items.length === 0 && page === 1) return <NoReservations />;
  return (
    <div className="space-y-6">
      <GroupedList groups={groups} nowMs={nowMs} />
      <Pager page={query.data.meta.page} pageSize={RESERVATION_PAGE_SIZE} total={query.data.meta.total} onPage={setPage} />
    </div>
  );
}

/** Container: one page of reservations, grouped active / confirmed / past within that page. */
export function ReservationList() {
  const { page, setPage } = usePageParam();
  return <PageBody page={page} setPage={setPage} />;
}
