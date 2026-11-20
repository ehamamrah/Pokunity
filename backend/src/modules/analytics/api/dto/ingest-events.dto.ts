import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CLIENT_EVENT_TYPES, SURFACES } from '../../domain/analytics-event';

export class ExperimentDto {
  @IsString() @Length(1, 64) key!: string;
  @IsIn(['control', 'treatment']) variant!: 'control' | 'treatment';
}

export class AnalyticsEventDto {
  @IsIn(CLIENT_EVENT_TYPES) type!: string;
  @IsUUID('all') jameyaId!: string;
  @IsOptional() @IsInt() @Min(1) position?: number | null;
  @IsIn(SURFACES) surface!: string;
  @IsOptional() @ValidateNested() @Type(() => ExperimentDto) experiment?: ExperimentDto;
  @IsISO8601() occurredAt!: string;
}

export class IngestEventsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}
