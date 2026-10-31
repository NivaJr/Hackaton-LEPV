import "server-only";
import { getLearningAiGateway } from "@/lib/llm/gateway";
import { readDocxText } from "../docx";
import { InMemoryActivityPublisher, InMemoryContentRepository, InMemoryImportQuota, UnconnectedActivityPublisher } from "../memory";
import type { ActivityPublisher } from "../ports";
import { ContentService } from "../service";
import { SupabaseClassDirectory } from "./supabase-class-directory";

type ContentRuntime = { repository: InMemoryContentRepository; publisher: ActivityPublisher; quota: InMemoryImportQuota };
const store = globalThis as typeof globalThis & { __eaiContentRuntime?: ContentRuntime };

/**
 * Drafts and published questions live in server memory until the content migration
 * (20261031020000_content.sql) exists. The publisher becomes LearningService.registerActivity
 * after feat/nivaldo-core is merged; keep ContentService unchanged and swap the adapter here.
 * In production the memory publisher is refused, because students would never receive the question.
 * CONTENT_MEMORY_PUBLISH=allow turns it back on for a local production build used as a demo.
 */
function runtime(): ContentRuntime {
  const memoryAllowed = process.env.NODE_ENV !== "production" || process.env.CONTENT_MEMORY_PUBLISH === "allow";
  store.__eaiContentRuntime ??= {
    repository: new InMemoryContentRepository(),
    publisher: memoryAllowed ? new InMemoryActivityPublisher() : new UnconnectedActivityPublisher(),
    quota: new InMemoryImportQuota(),
  };
  return store.__eaiContentRuntime;
}

export function createContentService() {
  const { repository, publisher, quota } = runtime();
  return new ContentService(repository, new SupabaseClassDirectory(), getLearningAiGateway(), publisher, undefined, undefined, quota, readDocxText);
}
