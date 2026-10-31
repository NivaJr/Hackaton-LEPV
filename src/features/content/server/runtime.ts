import "server-only";
import { createLearningService } from "@/features/learning/server/runtime";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readDocxText } from "../docx";
import { ContentError } from "../model";
import { ContentService } from "../service";
import { LearningActivityPublisher } from "./learning-publisher";
import { SupabaseClassDirectory } from "./supabase-class-directory";
import { SupabaseContentRepository, SupabaseImportQuota } from "./supabase-repository";
import { SupabaseContentFiles } from "./supabase-files";

export function createContentService() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new ContentError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase no servidor para guardar rascunhos e publicar questões.", 503);
  }
  return new ContentService(new SupabaseContentRepository(admin), new SupabaseClassDirectory(), getLearningAiGateway(),
    new LearningActivityPublisher(createLearningService), undefined, undefined, new SupabaseImportQuota(admin), readDocxText, new SupabaseContentFiles());
}
