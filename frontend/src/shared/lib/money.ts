/**
 * Money is always an integer count of minor units (halalas). 100000 = SAR 1,000.00.
 * Formatting happens only here so the UI never does float arithmetic on amounts.
 */
export const CURRENCY = 'SAR';
const MINOR_PER_MAJOR = 100;

export function assertMinorUnits(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`Expected a non-negative integer of minor units, received ${amount}`);
  }
}

function groupThousands(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 100000 -> "SAR 1,000.00" */
export function formatSar(minor: number): string {
  assertMinorUnits(minor);
  const major = Math.floor(minor / MINOR_PER_MAJOR);
  const minorPart = String(minor % MINOR_PER_MAJOR).padStart(2, '0');
  return `${CURRENCY} ${groupThousands(major)}.${minorPart}`;
}

export function formatFee(fee: number): string {
  return fee === 0 ? 'No fee' : formatSar(fee);
}

export function formatFeeRange(minFee: number, maxFee: number): string {
  if (minFee === maxFee) return formatFee(minFee);
  return `${formatFee(minFee)} to ${formatFee(maxFee)}`;
}

/**
 * Parses a human SAR input ("1,000", "1000.5") into minor units. Returns null for
 * empty or malformed input rather than throwing, because it runs on keystrokes.
 */
export function parseSarInput(input: string): number | null {
  const normalized = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * MINOR_PER_MAJOR);
}

/** Minor units -> plain SAR string for inputs, e.g. 100000 -> "1000". */
export function toSarInputValue(minor: number | null): string {
  if (minor === null) return '';
  assertMinorUnits(minor);
  const major = minor / MINOR_PER_MAJOR;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}
