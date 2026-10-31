import "server-only";
import { createLearningService } from "@/features/learning/server/runtime";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readDocxText } from "../docx";
import { InMemoryActivityPublisher, InMemoryContentRepository, InMemoryImportQuota } from "../memory";
import { ContentError } from "../model";
import type { ActivityPublisher, ContentRepository, ImportQuota } from "../ports";
import { ContentService } from "../service";
import { LearningActivityPublisher } from "./learning-publisher";
import { SupabaseClassDirectory } from "./supabase-class-directory";
import { SupabaseContentRepository, SupabaseImportQuota } from "./supabase-repository";

type ContentRuntime = { repository: ContentRepository; publisher: ActivityPublisher; quota: ImportQuota };
const store = globalThis as typeof globalThis & { __eaiContentRuntime?: ContentRuntime };

function runtime(): ContentRuntime {
  const admin = createSupabaseAdminClient();
  if (admin) return {
    repository: new SupabaseContentRepository(admin),
    publisher: new LearningActivityPublisher(createLearningService),
    quota: new SupabaseImportQuota(admin),
  };
  if (process.env.NODE_ENV === "production") {
    throw new ContentError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase no servidor para guardar rascunhos e publicar questões.", 503);
  }
  store.__eaiContentRuntime ??= {
    repository: new InMemoryContentRepository(),
    publisher: new InMemoryActivityPublisher(),
    quota: new InMemoryImportQuota(),
  };
  return store.__eaiContentRuntime;
}

export function createContentService() {
  const { repository, publisher, quota } = runtime();
  return new ContentService(repository, new SupabaseClassDirectory(), getLearningAiGateway(), publisher, undefined, undefined, quota, readDocxText);
}
