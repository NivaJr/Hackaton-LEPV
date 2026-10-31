import "server-only";
import { readLearningScoringPolicy } from "@/config/scoring";
import type { SubjectId } from "@/contracts";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LearningError } from "./model";
import { LearningService } from "./service";
import { SupabaseLearningRepository } from "./supabase-repository";

export function createLearningService() {
  const client = createSupabaseAdminClient();
  if (!client) throw new LearningError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase e a chave privada no servidor para usar as APIs de aprendizagem.", 503);
  const hasAssignedTeacher = async (institutionId: string, classId: string, subjectId: SubjectId) => {
    const { count, error } = await client.from("teacher_assignments").select("id", { count: "exact", head: true })
      .eq("school_id", institutionId).eq("classroom_id", classId).eq("subject_id", subjectId);
    if (error) throw new LearningError("PERSISTENCE_UNAVAILABLE", "Não foi possível conferir o professor da matéria.", 503);
    return (count ?? 0) > 0;
  };
  return new LearningService(new SupabaseLearningRepository(client), getLearningAiGateway(), readLearningScoringPolicy(process.env), undefined, hasAssignedTeacher);
}
