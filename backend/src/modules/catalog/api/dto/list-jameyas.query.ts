import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SORT_KEYS, SortKey } from '../../domain/sort-strategies';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class ListJameyasQuery {
  @IsOptional() @IsIn(SORT_KEYS) sort: SortKey = 'recommended';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) duration?: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) q?: string;
  @IsOptional() @Transform(toBoolean) @IsBoolean() availableOnly: boolean = true;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize: number = 20;
}
