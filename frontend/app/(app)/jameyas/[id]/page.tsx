import { notFound } from 'next/navigation';
import { JameyaDetailView } from '@/features/jameya-detail';
import { isUuid } from '@/shared/lib/uuid';

interface JameyaPageProps {
  params: Promise<{ id: string }>;
}

export default async function JameyaPage({ params }: JameyaPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <JameyaDetailView jameyaId={id} />;
}
