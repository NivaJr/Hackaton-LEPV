import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: admin }));

import { createLearningService } from "@/features/learning/server/runtime";
import { coordinator, fixtureIds } from "./helpers/learning-memory";

describe("autorização do runtime de aprendizagem", () => {
  it("consulta atribuições reais antes de permitir à coordenação gerir matéria já atribuída", async () => {
    const rpc = vi.fn();
    const subject = vi.fn(async () => ({ count: 1, error: null }));
    const classroom = vi.fn(() => ({ eq: subject }));
    const school = vi.fn(() => ({ eq: classroom }));
    admin.mockReturnValue({ rpc, from: () => ({ select: () => ({ eq: school }) }) });
    await expect(createLearningService().activityCatalog(coordinator(), fixtureIds.classId, "matematica"))
      .rejects.toMatchObject({ code: "TEACHER_ASSIGNED", status: 403 });
    expect(school).toHaveBeenCalledWith("school_id", fixtureIds.school);
    expect(classroom).toHaveBeenCalledWith("classroom_id", fixtureIds.classId);
    expect(subject).toHaveBeenCalledWith("subject_id", "matematica");
    expect(rpc).not.toHaveBeenCalled();
  });
});
