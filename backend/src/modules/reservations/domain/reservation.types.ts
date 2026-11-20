export type ReservationStatus = 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';
export type FailureReason = 'PAYMENT_DECLINED' | 'PAYMENT_TIMEOUT' | 'HOLD_EXPIRED' | 'SEAT_CONFLICT';

export interface ReservationRecord {
  id: string;
  userId: string;
  jameyaId: string;
  jameyaName: string;
  seatNumber: number;
  fee: number;
  monthlyAmount: number;
  status: ReservationStatus;
  failureReason: FailureReason | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationView {
  id: string;
  jameyaId: string;
  jameyaName: string;
  seatNumber: number;
  fee: number;
  monthlyAmount: number;
  currency: 'SAR';
  status: ReservationStatus;
  expiresAt: string;
  failureReason: FailureReason | null;
  payment: { id: string; status: string; amount: number; currency: 'SAR' } | null;
  createdAt: string;
  updatedAt: string;
}
