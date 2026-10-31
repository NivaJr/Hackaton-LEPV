import type { ClassMetrics } from "./model";
import type { RosterMetricsGateway } from "./ports";

function stablePercent(seed: string, floor: number): number {
  const hash = [...seed].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 9_973, 7);
  return floor + hash % (100 - floor);
}

/**
 * Illustrative numbers derived from the class ID, always tagged source: "fixture".
 * Replace with an adapter over the authorized summary from Task 03 once it is merged.
 */
export const fixtureRosterMetrics: RosterMetricsGateway = {
  async classMetrics(_schoolId, classroomIds) {
    const classes: ClassMetrics[] = classroomIds.map((classroomId) => ({
      classroomId,
      frequencyPercent: stablePercent(`f${classroomId}`, 55),
      correctPercent: stablePercent(`c${classroomId}`, 45),
    }));
    return { source: "fixture", classes };
  },
};
