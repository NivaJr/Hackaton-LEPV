import { describe, expect, it, vi } from "vitest";
import type { GeneratedQuestion, SessionContext } from "@/contracts";
import { ContentError } from "@/features/content/model";
import { LearningActivityPublisher } from "@/features/content/server/learning-publisher";
import { LearningError } from "@/features/learning/server/model";

vi.mock("server-only", () => ({}));

const teacher: SessionContext = {
  userId: "prof-1", roles: ["professor"], institutionId: "school-1", guardianStudentIds: [], coordinatorInstitutionIds: [],
  teacherAssignments: [{ institutionId: "school-1", classId: "class-7a", subjectId: "matematica" }],
};
const body: GeneratedQuestion = {
  subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
  statement: "Quanto é −3 + 8?", options: [{ id: "a", text: "5" }, { id: "b", text: "−11" }], correctOptionId: "a",
  explanation: "−3 + 8 = 5.", hint: "Use a reta numérica.",
};
const snapshot = { rootQuestionId: "q-1", body, contentVersion: 2, reviewed: true as const };

describe("LearningActivityPublisher", () => {
  it("hands the reviewed snapshot to the learning catalogue", async () => {
    const registerActivity = vi.fn(async () => ({ rootQuestionId: "q-1" }));
    const publisher = new LearningActivityPublisher(() => ({ registerActivity }));
    expect(publisher.delivery).toBe("aprendizagem");
    await expect(publisher.registerActivity(teacher, "class-7a", snapshot)).resolves.toEqual({ rootQuestionId: "q-1" });
    expect(registerActivity).toHaveBeenCalledWith(teacher, "class-7a", snapshot);
  });

  it("keeps the code and status of learning errors, including a missing configuration", async () => {
    const conflict = new LearningActivityPublisher(() => ({
      registerActivity: async () => { throw new LearningError("GRADE_MISMATCH", "O ano da questão difere do ano da turma.", 422); },
    }));
    const unconfigured = new LearningActivityPublisher(() => {
      throw new LearningError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase.", 503);
    });
    for (const [publisher, code, status] of [[conflict, "GRADE_MISMATCH", 422], [unconfigured, "PERSISTENCE_NOT_CONFIGURED", 503]] as const) {
      const error = await publisher.registerActivity(teacher, "class-7a", snapshot).then(() => null, (reason: unknown) => reason);
      expect(error).toBeInstanceOf(ContentError);
      expect([(error as ContentError).code, (error as ContentError).status]).toEqual([code, status]);
    }
  });
});
