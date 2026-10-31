import type { SessionContext, StudentSummary } from "@/contracts";
import type { StudentResultsGateway } from "../ports";

interface LearningSummaryReader {
  summary(actor: SessionContext, studentId: string, from: string, to: string): Promise<{ summary: StudentSummary }>;
}

/** Any failure, such as a student without enrollment, shows as unavailable rather than invented numbers. */
export function createLearningStudentResults(createService: () => LearningSummaryReader): StudentResultsGateway {
  return {
    async studentResults(actor, studentId, from, to) {
      try {
        const { summary } = await createService().summary(actor, studentId, from, to);
        return { source: "real", summary };
      } catch {
        return { source: "unavailable", summary: null };
      }
    },
  };
}
