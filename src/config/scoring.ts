/** Proposed calibration only. These values do not authorize any API to grant points. */
export const PROPOSED_ORIGINAL_POINTS = 100;
export const RECOVERY_REWARD_MULTIPLIER = 0.7;

/** No sequence cap has been approved; null is deliberately the default. */
export const DEFAULT_RECOVERY_CAP_POINTS: number | null = null;

export const PROPOSED_RANK_THRESHOLDS = [
  { id: "ferro", name: "Ferro", minimumPoints: 0 },
  { id: "bronze", name: "Bronze", minimumPoints: 300 },
  { id: "prata", name: "Prata", minimumPoints: 1_000 },
  { id: "ouro", name: "Ouro", minimumPoints: 2_500 },
  { id: "platina", name: "Platina", minimumPoints: 5_000 },
  { id: "esmeralda", name: "Esmeralda", minimumPoints: 9_000 },
  { id: "diamante", name: "Diamante", minimumPoints: 15_000 },
  { id: "mestre", name: "Mestre", minimumPoints: 22_000 },
  { id: "grao-mestre", name: "Grão-Mestre", minimumPoints: 31_000 },
  { id: "desafiante", name: "Desafiante", minimumPoints: 42_000 },
] as const;

export type Rank = (typeof PROPOSED_RANK_THRESHOLDS)[number];
