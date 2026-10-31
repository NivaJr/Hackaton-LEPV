import "server-only";
import { createLearningService } from "@/features/learning/server/runtime";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readDocxText } from "../docx";
import { InMemoryActivityPublisher, InMemoryContentRepository, InMemoryImportQuota, UnconnectedActivityPublisher } from "../memory";
import type { ActivityPublisher } from "../ports";
import { ContentService } from "../service";
import { LearningActivityPublisher } from "./learning-publisher";
import { SupabaseClassDirectory } from "./supabase-class-directory";

type ContentRuntime = { repository: InMemoryContentRepository; publisher: ActivityPublisher; quota: InMemoryImportQuota };
const store = globalThis as typeof globalThis & { __eaiContentRuntime?: ContentRuntime };

/**
 * Drafts live in server memory until the content migration (20261031020000_content.sql) exists.
 * With the Supabase secret key, publishing goes to the learning catalogue and reaches students.
 * Without it, development keeps a memory publisher and production refuses, because students would
 * never receive the question. CONTENT_MEMORY_PUBLISH=allow keeps memory for a local production demo.
 */
function publisher(): ActivityPublisher {
  if (createSupabaseAdminClient()) return new LearningActivityPublisher(createLearningService);
  const memoryAllowed = process.env.NODE_ENV !== "production" || process.env.CONTENT_MEMORY_PUBLISH === "allow";
  return memoryAllowed ? new InMemoryActivityPublisher() : new UnconnectedActivityPublisher();
}

function runtime(): ContentRuntime {
  store.__eaiContentRuntime ??= {
    repository: new InMemoryContentRepository(),
    publisher: publisher(),
    quota: new InMemoryImportQuota(),
  };
  return store.__eaiContentRuntime;
}

export function createContentService() {
  const { repository, publisher, quota } = runtime();
  return new ContentService(repository, new SupabaseClassDirectory(), getLearningAiGateway(), publisher, undefined, undefined, quota, readDocxText);
}
