import type { FamilyMetricsGateway } from "./ports";

/** Example summary for tests and demos, always tagged source: "fixture". Production uses the learning core. */
export const fixtureFamilyMetrics: FamilyMetricsGateway = {
  async studentSummary(_actor, studentId, from, to) {
    return {
      source: "fixture",
      summary: {
        studentId, periodStart: from, periodEnd: to, accessDays: 12, activityDays: 9, correctAnswers: 34, incorrectAnswers: 11,
        xp: 0, rankPoints: 0, rankName: "Exemplo", difficultSkillCodes: ["EF06MA07"],
      },
    };
  },
};
