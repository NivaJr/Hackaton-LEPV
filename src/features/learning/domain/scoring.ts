import {
  DEFAULT_RECOVERY_CAP_POINTS,
  RANK_THRESHOLDS,
  RECOVERY_REWARD_MULTIPLIER,
} from "@/config/scoring";

function requirePoints(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} deve ser um número finito não negativo.`);
  }
}

function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Pure calculation only. This function does not persist or authorize a credit. */
export function calculateRecoveryReward({
  originalPoints,
  alreadyAwarded = 0,
  capPoints = DEFAULT_RECOVERY_CAP_POINTS,
}: {
  originalPoints: number;
  alreadyAwarded?: number;
  capPoints?: number | null;
}): number {
  requirePoints(originalPoints, "originalPoints");
  requirePoints(alreadyAwarded, "alreadyAwarded");
  if (capPoints !== null) requirePoints(capPoints, "capPoints");
  const nominal = roundPoints(originalPoints * RECOVERY_REWARD_MULTIPLIER);
  if (capPoints === null) return nominal;
  return roundPoints(Math.min(nominal, Math.max(0, capPoints - alreadyAwarded)));
}

/** Confirmed rank calibration; annual points remain cumulative above Onisciente. */
export function getRankForPoints(points: number) {
  requirePoints(points, "points");
  return [...RANK_THRESHOLDS].reverse().find((rank) => points >= rank.minimumPoints)!;
}

export function getRankProgress(points: number) {
  const current = getRankForPoints(points);
  const index = RANK_THRESHOLDS.findIndex((rank) => rank.id === current.id);
  const next = RANK_THRESHOLDS[index + 1] ?? null;
  const progress = next
    ? Math.min(1, (points - current.minimumPoints) / (next.minimumPoints - current.minimumPoints))
    : 1;
  return { current, next, progress, pointsToNext: next ? Math.max(0, next.minimumPoints - points) : 0 };
}
