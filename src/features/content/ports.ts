import type { GeneratedQuestion, SessionContext } from "@/contracts";
import type { DocumentExtractionInput, ExtractionReportingGateway } from "@/lib/llm/types";
import type { ContentClass, ContentQuestion } from "./model";

export type ContentStorage = "memoria" | "supabase";

export interface ContentRepository {
  readonly storage: ContentStorage;
  list(filter: { institutionId: string; classId: string; subjectId: string }): Promise<ContentQuestion[]>;
  get(institutionId: string, id: string): Promise<ContentQuestion | null>;
  insert(items: ContentQuestion[]): Promise<void>;
  /** Compare-and-set on version; false means someone saved first. */
  replace(item: ContentQuestion, expectedVersion: number): Promise<boolean>;
  remove(institutionId: string, id: string, expectedVersion: number): Promise<boolean>;
}

/** Classes come from the school roster (classrooms table), never from the client. */
export interface ClassDirectory {
  listClasses(institutionId: string, classIds?: string[]): Promise<ContentClass[]>;
  hasAssignedTeacher?(institutionId: string, classId: string, subjectId: string): Promise<boolean>;
}

/** Same shape as LearningService.registerActivity. */
export type ActivitySnapshot = {
  activityType?: "exercise" | "weekly_challenge";
  contentId?: string;
  contentTitle?: string;
  contentDefinedBy?: "teacher" | "coordinator";
  rootQuestionId: string;
  body: GeneratedQuestion;
  contentVersion: number;
  reviewed: true;
};

/**
 * "memoria": published questions stay in this process only and students do not receive them.
 * "desligada": publishing is refused. "aprendizagem": LearningService.registerActivity.
 */
export type ActivityDelivery = "memoria" | "desligada" | "aprendizagem";

export interface ActivityPublisher {
  readonly delivery: ActivityDelivery;
  registerActivity(actor: SessionContext, classId: string, value: ActivitySnapshot): Promise<{ rootQuestionId: string }>;
}

export type { DocumentExtractionInput };

/** The report keeps the count and reasons of what the gateway discarded, so the teacher sees it. */
export type ContentExtractionGateway = ExtractionReportingGateway;

export interface ContentFileStore {
  save(actor: SessionContext, input: { classId: string; subjectId: string; kind: "pdf" | "docx"; bytes: Uint8Array }): Promise<string>;
}

/** Limits paid AI calls per user and school day, and one read at a time per user. */
export interface ImportQuota {
  /** Returns a release function, or the reason the read was refused. */
  acquire(key: { institutionId: string; userId: string }, at: Date): { ok: true; release(): void } | { ok: false; reason: "daily" | "busy"; limit: number };
}
