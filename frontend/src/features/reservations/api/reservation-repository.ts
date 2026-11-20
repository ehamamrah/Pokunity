import { apiClient, type ApiResponse } from '@/shared/api-client';
import { reservationListSchema, reservationSchema, type Reservation, type ReservationStatus } from '@/shared/contract';

/** Repository for the reservation aggregate. Pure transport; no caching or UI policy here. */
export interface ReserveSeatInput {
  jameyaId: string;
  seatNumber: number;
}

export function createReservation(input: ReserveSeatInput, idempotencyKey: string): Promise<ApiResponse<Reservation>> {
  return apiClient.post('/reservations', reservationSchema, { body: input, idempotencyKey });
}

export async function fetchReservation(id: string): Promise<Reservation> {
  const { data } = await apiClient.get(`/reservations/${id}`, reservationSchema);
  return data;
}

export async function fetchReservations(statuses: readonly ReservationStatus[] = []): Promise<Reservation[]> {
  const { data } = await apiClient.get('/reservations', reservationListSchema, { query: { status: [...statuses] } });
  return data.data;
}

export function checkoutReservation(
  id: string,
  paymentMethodToken: string,
  idempotencyKey: string,
): Promise<ApiResponse<Reservation>> {
  return apiClient.post(`/reservations/${id}/checkout`, reservationSchema, {
    body: { paymentMethodToken },
    idempotencyKey,
  });
}

export async function releaseReservation(id: string): Promise<Reservation> {
  const { data } = await apiClient.delete(`/reservations/${id}`, reservationSchema);
  return data;
}
