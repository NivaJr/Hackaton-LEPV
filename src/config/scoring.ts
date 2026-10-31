/** Regras confirmadas para créditos concedidos exclusivamente pelo servidor. */
export const REGULAR_EXERCISE_RANK_POINTS = 50;
export const WEEKLY_CHALLENGE_RANK_POINTS = 100;
export const WEEKLY_CHALLENGE_XP = 100;
export const RECOVERY_RANK_POINTS = 35;
export const RECOVERY_REWARD_MULTIPLIER = 0.7;

/** No sequence cap has been approved; null is deliberately the default. */
export const DEFAULT_RECOVERY_CAP_POINTS: number | null = null;

export const RANK_THRESHOLDS = [
  { id: "ferro", name: "Ferro", minimumPoints: 0 },
  { id: "bronze", name: "Bronze", minimumPoints: 1_000 },
  { id: "prata", name: "Prata", minimumPoints: 2_000 },
  { id: "ouro", name: "Ouro", minimumPoints: 3_000 },
  { id: "platina", name: "Platina", minimumPoints: 4_000 },
  { id: "esmeralda", name: "Esmeralda", minimumPoints: 5_000 },
  { id: "diamante", name: "Diamante", minimumPoints: 6_000 },
  { id: "mestre", name: "Mestre", minimumPoints: 7_000 },
  { id: "grao-mestre", name: "Grão-Mestre", minimumPoints: 8_000 },
  { id: "onisciente", name: "Onisciente", minimumPoints: 9_000 },
] as const;

export const PROPOSED_RANK_THRESHOLDS = RANK_THRESHOLDS;
export type Rank = (typeof RANK_THRESHOLDS)[number];

/** Explicit provisional configuration, never inferred from the proposed constants above. */
export interface LearningScoringPolicy {
  originalPoints: number;
  recoveryReference: "original" | "previous";
  adaptiveXpFollowsRoot: boolean;
  recoveryCapPoints: null;
}

export const CONFIRMED_LEARNING_SCORING_POLICY: LearningScoringPolicy = {
  originalPoints: REGULAR_EXERCISE_RANK_POINTS,
  recoveryReference: "original",
  adaptiveXpFollowsRoot: true,
  recoveryCapPoints: DEFAULT_RECOVERY_CAP_POINTS,
};

/** A política deixou de depender de variáveis de ambiente após a confirmação das regras. */
export function readLearningScoringPolicy(_env: Record<string, string | undefined>): LearningScoringPolicy {
  return { ...CONFIRMED_LEARNING_SCORING_POLICY };
}
