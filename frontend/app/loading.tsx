import { SkeletonCards } from '@/shared/ui';

export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SkeletonCards />
    </main>
  );
}
