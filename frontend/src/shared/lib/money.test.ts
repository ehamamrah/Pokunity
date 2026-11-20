import { describe, expect, it } from 'vitest';
import { formatFeeRange, formatSar, parseSarInput, toSarInputValue } from './money';

describe('formatSar', () => {
  it.each([
    [100000, 'SAR 1,000.00'],
    [0, 'SAR 0.00'],
    [12000, 'SAR 120.00'],
    [1, 'SAR 0.01'],
    [1234567, 'SAR 12,345.67'],
  ])('formats %i minor units as %s', (minor, expected) => {
    expect(formatSar(minor)).toBe(expected);
  });

  it('rejects fractional or negative amounts instead of rounding silently', () => {
    expect(() => formatSar(10.5)).toThrow(RangeError);
    expect(() => formatSar(-1)).toThrow(RangeError);
  });
});

describe('formatFeeRange', () => {
  it('shows "No fee" for zero and a range otherwise', () => {
    expect(formatFeeRange(0, 0)).toBe('No fee');
    expect(formatFeeRange(0, 36000)).toBe('No fee to SAR 360.00');
  });
});

describe('SAR input parsing', () => {
  it('converts a typed SAR amount into minor units', () => {
    expect(parseSarInput('1,000')).toBe(100000);
    expect(parseSarInput('12.5')).toBe(1250);
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(parseSarInput('abc')).toBeNull();
    expect(parseSarInput('')).toBeNull();
  });

  it('renders minor units back as an input value', () => {
    expect(toSarInputValue(100000)).toBe('1000');
    expect(toSarInputValue(1250)).toBe('12.50');
    expect(toSarInputValue(null)).toBe('');
  });
});
