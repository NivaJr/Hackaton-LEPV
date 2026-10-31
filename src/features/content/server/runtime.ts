import "server-only";
import { createLearningService } from "@/features/learning/server/runtime";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readDocxText } from "../docx";
import { InMemoryImportQuota, UnconnectedActivityPublisher } from "../memory";
import type { ActivityPublisher } from "../ports";
import { ContentService } from "../service";
import { LearningActivityPublisher } from "./learning-publisher";
import { SupabaseClassDirectory } from "./supabase-class-directory";
import { SupabaseContentRepository } from "./supabase-repository";
import { SupabaseContentFiles } from "./supabase-files";

type ContentRuntime = { repository: SupabaseContentRepository; publisher: ActivityPublisher; quota: InMemoryImportQuota };
const store = globalThis as typeof globalThis & { __eaiContentRuntime?: ContentRuntime };

/**
 * Staff drafts persist through their authenticated session and RLS.
 * With the server key, publishing goes to the learning catalogue and reaches students.
 * Without it, the authenticated runtime refuses publication. Browser demonstrations
 * inject their own explicitly in-memory adapters and never enter this factory.
 */
function publisher(): ActivityPublisher {
  if (createSupabaseAdminClient()) return new LearningActivityPublisher(createLearningService);
  return new UnconnectedActivityPublisher();
}

function runtime(): ContentRuntime {
  store.__eaiContentRuntime ??= {
    repository: new SupabaseContentRepository(),
    publisher: publisher(),
    quota: new InMemoryImportQuota(),
  };
  return store.__eaiContentRuntime;
}

export function createContentService() {
  const { repository, publisher, quota } = runtime();
  return new ContentService(repository, new SupabaseClassDirectory(), getLearningAiGateway(), publisher, undefined, undefined, quota, readDocxText, new SupabaseContentFiles());
}
