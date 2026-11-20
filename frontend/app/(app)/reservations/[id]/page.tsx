import { notFound } from 'next/navigation';
import { CheckoutView } from '@/features/checkout';
import { isUuid } from '@/shared/lib/uuid';

interface ReservationPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReservationPage({ params }: ReservationPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Confirm your seat</h1>
      <CheckoutView reservationId={id} />
    </div>
  );
}
