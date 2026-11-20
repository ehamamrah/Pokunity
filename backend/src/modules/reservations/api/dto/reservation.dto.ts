import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ReservationStatus } from '../../domain/reservation.types';

const STATUSES: ReservationStatus[] = ['HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED'];

export class CreateReservationDto {
  @IsUUID('all') jameyaId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(36) seatNumber!: number;
}

export class CheckoutDto {
  @IsString() @Length(1, 100) paymentMethodToken!: string;
}

export class ListReservationsQuery {
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: ReservationStatus[];
}
