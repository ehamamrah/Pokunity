'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useNow } from '@/shared/lib/use-now';
import { Alert, EmptyState, SkeletonCards } from '@/shared/ui';
import { useReservations } from '../api/use-reservations';
import { groupReservations, type ReservationGroups } from '../model/status';
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

/** Container: loads the viewer's reservations and groups them into active / confirmed / past. */
export function ReservationList() {
  const query = useReservations();
  const nowMs = useNow(1_000);
  const items = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => groupReservations(items), [items]);
  if (query.isPending) return <SkeletonCards count={2} />;
  if (query.isError) return <Alert tone="danger" title="We could not load your reservations">Check your connection and try again.</Alert>;
  if (items.length === 0) {
    return <EmptyState title="No reservations yet" action={<Link prefetch={false} href="/" className={BROWSE_LINK}>Browse Jameyas</Link>}>When you hold a seat, it appears here with its countdown and payment status.</EmptyState>;
  }
  return <GroupedList groups={groups} nowMs={nowMs} />;
}
