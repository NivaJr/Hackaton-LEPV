import type { SessionContext, StudentSummary } from "@/contracts";
import type { FamilyMetricsGateway } from "../ports";

interface LearningSummaryReader {
  summary(actor: SessionContext, studentId: string, from: string, to: string): Promise<{ summary: StudentSummary }>;
}

/** Any failure, such as a student without enrollment, shows as unavailable rather than invented numbers. */
export function createLearningFamilyMetrics(createService: () => LearningSummaryReader): FamilyMetricsGateway {
  return {
    async studentSummary(actor, studentId, from, to) {
      try {
        const { summary } = await createService().summary(actor, studentId, from, to);
        return { source: "real", summary };
      } catch {
        return { source: "unavailable", summary: null };
      }
    },
  };
}
