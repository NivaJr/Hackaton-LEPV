import type { GeneratedQuestion, SubjectId } from "@/contracts";
import type { ContentIssue, ContentQuestion, ContentScope } from "../model";
import type { ActivityDelivery, ContentStorage } from "../ports";

export type ScopeRef = { classId: string; subjectId: SubjectId };
export type ImportScopeRef = ScopeRef & { contentTitle?: string; activityType?: "exercise" | "weekly_challenge" };
export type ExampleSummary = { id: string; statement: string; skillCodes: string[]; skillCheck: "alta_confianca" | "a_conferir" };
export type ContentListing = {
  scope: ContentScope;
  drafts: ContentQuestion[];
  published: ContentQuestion[];
  examples: ExampleSummary[];
  storage: ContentStorage;
  delivery: ActivityDelivery;
};
export type ImportResponse = { drafts: ContentQuestion[]; rejected: number; rejectedReasons: string[]; missingSkills: number };

export interface ContentClient {
  scopes(): Promise<ContentScope[]>;
  list(scope: ScopeRef): Promise<ContentListing>;
  importText(scope: ImportScopeRef, text: string): Promise<ImportResponse>;
  importFile(scope: ImportScopeRef, file: File): Promise<ImportResponse>;
  importExample(scope: ImportScopeRef, exampleId: string): Promise<ImportResponse>;
  saveDraft(id: string, input: { version: number; reviewed: boolean; body: GeneratedQuestion }): Promise<ContentQuestion>;
  deleteDraft(id: string): Promise<void>;
  publish(id: string): Promise<ContentQuestion>;
}

export class ContentClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly issues: ContentIssue[] = []) {
    super(message);
    this.name = "ContentClientError";
  }
}

export const AI_UNAVAILABLE_CODES = new Set(["AI_NOT_CONFIGURED", "AI_PROVIDER_ERROR", "AI_RATE_LIMITED"]);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/content/${path}`, { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new ContentClientError("NETWORK_ERROR", "Sem conexão com o servidor. Verifique a internet e tente de novo.", 0);
  }
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; issues?: ContentIssue[] } } | null;
  if (!response.ok) {
    throw new ContentClientError(
      payload?.error?.code ?? "UNKNOWN_ERROR",
      payload?.error?.message ?? "Não foi possível concluir a operação.",
      response.status,
      payload?.error?.issues ?? [],
    );
  }
  return payload as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const httpContentClient: ContentClient = {
  async scopes() {
    return (await call<{ scopes: ContentScope[] }>("scopes")).scopes;
  },
  list(scope) {
    return call<ContentListing>(`questions?${new URLSearchParams(scope).toString()}`);
  },
  importText(scope, text) {
    return call<ImportResponse>("imports", jsonInit("POST", { ...scope, text }));
  },
  importFile(scope, file) {
    const form = new FormData();
    form.set("classId", scope.classId);
    form.set("subjectId", scope.subjectId);
    if (scope.contentTitle) form.set("contentTitle", scope.contentTitle);
    if (scope.activityType) form.set("activityType", scope.activityType);
    form.set("file", file);
    return call<ImportResponse>("imports", { method: "POST", body: form });
  },
  importExample(scope, exampleId) {
    return call<ImportResponse>("imports", jsonInit("POST", { ...scope, exampleId }));
  },
  async saveDraft(id, input) {
    return (await call<{ question: ContentQuestion }>(`drafts/${encodeURIComponent(id)}`, jsonInit("PUT", input))).question;
  },
  async deleteDraft(id) {
    await call(`drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async publish(id) {
    return (await call<{ question: ContentQuestion }>(`drafts/${encodeURIComponent(id)}/publish`, jsonInit("POST", {}))).question;
  },
};
