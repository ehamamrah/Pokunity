import { Suspense } from 'react';
import { ReservationList } from '@/features/reservations';
import { SkeletonCards } from '@/shared/ui';

export default function ReservationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My reservations</h1>
        <p className="mt-1 text-sm text-slate-600">Holds, confirmed seats and past attempts. You are charged only when a seat is confirmed.</p>
      </div>
      <Suspense fallback={<SkeletonCards count={2} />}>
        <ReservationList />
      </Suspense>
    </div>
  );
}
