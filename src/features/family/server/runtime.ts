import "server-only";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fixtureFamilyMetrics } from "../fixtures";
import { FamilyError } from "../model";
import { FamilyService } from "../service";
import { createSupabaseFamilyRepository } from "./supabase-repository";

export async function createFamilyService(): Promise<FamilyService> {
  const client = await createSupabaseServerClient();
  if (!client) throw new FamilyError("NOT_CONFIGURED", "Configure o Supabase para usar o painel do responsável.", 503);
  return new FamilyService({
    repository: createSupabaseFamilyRepository(client),
    metrics: fixtureFamilyMetrics,
    summarize: (input) => getLearningAiGateway().summarizeStudent(input),
  });
}
