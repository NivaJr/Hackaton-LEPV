import type { FamilyMetricsGateway } from "./ports";

/**
 * Example summary, always tagged source: "fixture" and shown as such by the panel.
 * Replace with an adapter over GET /api/learning/summary (Task 03) once it is merged.
 */
export const fixtureFamilyMetrics: FamilyMetricsGateway = {
  async studentSummary(studentId, from, to) {
    return {
      source: "fixture",
      summary: {
        studentId, periodStart: from, periodEnd: to, accessDays: 12, activityDays: 9, correctAnswers: 34, incorrectAnswers: 11,
        xp: 0, rankPoints: 0, rankName: "Exemplo", difficultSkillCodes: ["EF06MA07"],
      },
    };
  },
};
