import { createHash } from 'node:crypto';

export type Variant = 'control' | 'treatment';

export interface ExperimentAssignment {
  key: string;
  variant: Variant;
}

/** Ranking experiment: 50/50 split between control (baseline) and treatment (personalized). */
export const RANKING_EXPERIMENT = { key: 'ranking_v2', treatmentPercent: 50 } as const;

/**
 * Deterministic, sticky assignment: the same (userId, experimentKey) always lands in the same
 * bucket on every instance, with no stored state. Bucket = first 32 bits of SHA-256 mod 100.
 */
export function bucketOf(userId: string, experimentKey: string): number {
  const digest = createHash('sha256').update(`${experimentKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function assignVariant(
  userId: string,
  experiment: { key: string; treatmentPercent: number } = RANKING_EXPERIMENT,
): ExperimentAssignment {
  const variant = bucketOf(userId, experiment.key) < experiment.treatmentPercent ? 'treatment' : 'control';
  return { key: experiment.key, variant };
}
