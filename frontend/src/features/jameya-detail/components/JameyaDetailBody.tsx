'use client';

import { JameyaBadges, JameyaFacts, LazySimilarJameyas, SeatsLeft } from '@/features/marketplace';
import type { JameyaDetail, Seat } from '@/shared/contract';
import type { DetailFlow } from '../hooks/use-jameya-detail-flow';
import { ReservePanel } from './ReservePanel';
import { SeatMap } from './SeatMap';
import { TradeoffNote } from './TradeoffNote';

function DetailHeader({ detail }: { detail: JameyaDetail }) {
  return (
    <header className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{detail.name}</h1>
      <JameyaBadges jameya={detail} />
      <JameyaFacts jameya={detail} />
      <SeatsLeft jameya={detail} />
    </header>
  );
}

function selectedSeatOf(detail: JameyaDetail, selectedSeat: number | null): Seat | null {
  return detail.seats.find((candidate) => candidate.seatNumber === selectedSeat) ?? null;
}

/** Presentational layout: header and facts, then the seat map beside the reserve panel. */
export function JameyaDetailBody({ detail, flow }: { detail: JameyaDetail; flow: DetailFlow }) {
  return (
    <div className="space-y-8">
      <DetailHeader detail={detail} />
      <TradeoffNote />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <SeatMap seats={detail.seats} selectedSeat={flow.selectedSeat} holdingSeat={flow.holdingSeat} onSelect={flow.selectSeat} />
        <ReservePanel detail={detail} seat={selectedSeatOf(detail, flow.selectedSeat)} reserving={flow.reserving} error={flow.error} onReserve={flow.reserveSelected} onRefresh={flow.refresh} />
      </div>
      <LazySimilarJameyas jameyaId={detail.id} />
    </div>
  );
}
