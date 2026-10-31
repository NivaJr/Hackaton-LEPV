import "server-only";
import { readLearningScoringPolicy } from "@/config/scoring";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LearningError } from "./model";
import { LearningService } from "./service";
import { SupabaseLearningRepository } from "./supabase-repository";

export function createLearningService() {
  const client = createSupabaseAdminClient();
  if (!client) throw new LearningError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase e a chave privada no servidor para usar as APIs de aprendizagem.", 503);
  return new LearningService(new SupabaseLearningRepository(client), getLearningAiGateway(), readLearningScoringPolicy(process.env));
}
