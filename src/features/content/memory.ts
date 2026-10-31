import type { SessionContext } from "@/contracts";
import { AI_IMPORTS_PER_DAY, canManageContent, ContentError, type ContentClass, type ContentQuestion } from "./model";
import type { ActivityPublisher, ActivitySnapshot, ClassDirectory, ContentRepository, ImportQuota } from "./ports";

/** Process memory only: drafts disappear when the server restarts. */
export class InMemoryContentRepository implements ContentRepository {
  readonly storage = "memoria" as const;
  private readonly items = new Map<string, ContentQuestion>();

  constructor(seed: ContentQuestion[] = []) {
    for (const item of seed) this.items.set(item.id, structuredClone(item));
  }

  async list(filter: { institutionId: string; classId: string; subjectId: string }) {
    return [...this.items.values()]
      .filter((item) => item.institutionId === filter.institutionId && item.classId === filter.classId && item.body.subjectId === filter.subjectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((item) => structuredClone(item));
  }

  async get(institutionId: string, id: string) {
    const item = this.items.get(id);
    return item && item.institutionId === institutionId ? structuredClone(item) : null;
  }

  async insert(items: ContentQuestion[]) {
    if (items.some((item) => this.items.has(item.id))) throw new ContentError("DUPLICATE_ID", "Identificador de questão repetido.");
    for (const item of items) this.items.set(item.id, structuredClone(item));
  }

  async replace(item: ContentQuestion, expectedVersion: number) {
    const current = this.items.get(item.id);
    if (!current || current.institutionId !== item.institutionId || current.version !== expectedVersion) return false;
    this.items.set(item.id, structuredClone(item));
    return true;
  }

  async remove(institutionId: string, id: string, expectedVersion: number) {
    const current = this.items.get(id);
    if (!current || current.institutionId !== institutionId || current.version !== expectedVersion) return false;
    return this.items.delete(id);
  }
}

export class InMemoryClassDirectory implements ClassDirectory {
  constructor(private readonly classes: Array<ContentClass & { institutionId: string }>) {}

  async listClasses(institutionId: string, classIds?: string[]) {
    return this.classes
      .filter((item) => item.institutionId === institutionId && (!classIds || classIds.includes(item.id)))
      .map(({ id, name, grade }) => ({ id, name, grade }));
  }
}

/**
 * Stand-in for the learning catalogue. When feat/nivaldo-core is merged, replace it in
 * server/runtime.ts with an adapter that calls LearningService.registerActivity and maps
 * LearningError (code/status) to ContentError.
 */
export class InMemoryActivityPublisher implements ActivityPublisher {
  readonly delivery = "memoria" as const;
  readonly activities = new Map<string, ActivitySnapshot & { classId: string }>();

  async registerActivity(actor: SessionContext, classId: string, value: ActivitySnapshot) {
    if (!value.reviewed) throw new ContentError("REVIEW_REQUIRED", "Só questões revisadas podem ser publicadas.", 422);
    if (!canManageContent(actor, classId, value.body.subjectId)) {
      throw new ContentError("CONTENT_FORBIDDEN", "A publicação exige atribuição nesta turma e matéria.", 403);
    }
    const key = `${classId}:${value.rootQuestionId}`;
    const existing = this.activities.get(key);
    if (existing) {
      if (JSON.stringify(existing.body) !== JSON.stringify(value.body) || existing.contentVersion !== value.contentVersion) {
        throw new ContentError("CONTENT_VERSION_CONFLICT", "A versão publicada não pode ser alterada.");
      }
    } else this.activities.set(key, { ...structuredClone(value), classId });
    return { rootQuestionId: value.rootQuestionId };
  }
}

/** Production stand-in until LearningService is connected: refuses instead of pretending students got the question. */
export class UnconnectedActivityPublisher implements ActivityPublisher {
  readonly delivery = "desligada" as const;

  async registerActivity(): Promise<{ rootQuestionId: string }> {
    throw new ContentError("PUBLISH_NOT_CONNECTED", "A publicação para os alunos ainda não está ligada neste ambiente. O rascunho revisado continua salvo.", 503);
  }
}

const schoolDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Per-process counter. On serverless each instance counts on its own, so the real limit can be a few
 * times higher; move it to the database together with the content migration.
 */
export class InMemoryImportQuota implements ImportQuota {
  private readonly used = new Map<string, number>();
  private readonly running = new Set<string>();

  constructor(private readonly perDay = AI_IMPORTS_PER_DAY) {}

  acquire(key: { institutionId: string; userId: string }, at: Date) {
    const user = `${key.institutionId}:${key.userId}`;
    const day = schoolDay.format(at);
    for (const stored of this.used.keys()) if (!stored.endsWith(`:${day}`)) this.used.delete(stored);
    const counter = `${user}:${day}`;
    const count = this.used.get(counter) ?? 0;
    if (count >= this.perDay) return { ok: false as const, reason: "daily" as const, limit: this.perDay };
    if (this.running.has(user)) return { ok: false as const, reason: "busy" as const, limit: this.perDay };
    this.used.set(counter, count + 1);
    this.running.add(user);
    let released = false;
    return {
      ok: true as const,
      release: () => {
        if (released) return;
        released = true;
        this.running.delete(user);
      },
    };
  }
}
