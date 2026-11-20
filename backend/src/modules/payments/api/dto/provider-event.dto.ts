import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Min } from 'class-validator';
import { ProviderEventType } from '../../domain/payment.types';

export class ProviderEventDto {
  @IsString() @Length(1, 200) eventId!: string;
  @IsIn(['payment.authorized', 'payment.failed', 'payment.captured', 'payment.voided']) type!: ProviderEventType;
  @IsString() @Length(1, 200) paymentIntentId!: string;
  @IsInt() @Min(0) amount!: number;
  @IsIn(['SAR']) currency!: string;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsString() failureCode?: string | null;
}
