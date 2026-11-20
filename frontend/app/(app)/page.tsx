import { Suspense } from 'react';
import { KycBanner } from '@/features/auth';
import { MarketplaceView } from '@/features/marketplace';
import { SkeletonCards } from '@/shared/ui';

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find your Jameya</h1>
        <p className="mt-1 text-sm text-slate-600">Compare monthly amounts, payout timing and fees before you hold a seat.</p>
      </div>
      <KycBanner />
      <Suspense fallback={<SkeletonCards />}>
        <MarketplaceView />
      </Suspense>
    </div>
  );
}
