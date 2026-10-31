import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ContentError, ContentQuestionSchema, type ContentQuestion } from "../model";
import type { ContentRepository, ImportQuota } from "../ports";

export interface ContentRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

async function rpc<T>(client: ContentRpcClient, name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === "23505") throw new ContentError("DUPLICATE_ID", "Esta questão já foi registrada.");
    throw new ContentError("PERSISTENCE_UNAVAILABLE", "Não foi possível acessar o banco de conteúdo. Confira as migrações e tente novamente.", 503);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ContentError("INVALID_PERSISTED_CONTENT", "O conteúdo salvo não corresponde ao contrato da aplicação.", 503);
  return parsed.data;
}

/** All answer keys stay behind server-only RPCs. No process-memory fallback. */
export class SupabaseContentRepository implements ContentRepository {
  readonly storage = "supabase" as const;
  constructor(private readonly client: ContentRpcClient) {}

  list(filter: { institutionId: string; classId: string; subjectId: string }) {
    return rpc(this.client, "content_list_questions", {
      p_school: filter.institutionId, p_class: filter.classId, p_subject: filter.subjectId,
    }, z.array(ContentQuestionSchema));
  }
  get(institutionId: string, id: string) {
    return rpc(this.client, "content_get_question", { p_school: institutionId, p_id: id }, ContentQuestionSchema.nullable());
  }
  async insert(items: ContentQuestion[]) {
    if (!items.length) return;
    await rpc(this.client, "content_insert_questions", { p_items: z.array(ContentQuestionSchema).parse(items) }, z.unknown());
  }
  replace(item: ContentQuestion, expectedVersion: number) {
    return rpc(this.client, "content_replace_question", { p_item: ContentQuestionSchema.parse(item), p_expected_version: expectedVersion }, z.boolean());
  }
  remove(institutionId: string, id: string, expectedVersion: number) {
    return rpc(this.client, "content_remove_question", { p_school: institutionId, p_id: id, p_expected_version: expectedVersion }, z.boolean());
  }
}

const SlotSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(["daily", "busy"]), limit: z.number().int().positive() }),
]);

export class SupabaseImportQuota implements ImportQuota {
  constructor(private readonly client: ContentRpcClient) {}
  async acquire(key: { institutionId: string; userId: string }, _at: Date) {
    const args = { p_school: key.institutionId, p_user: key.userId, p_token: randomUUID() };
    const slot = await rpc(this.client, "content_acquire_import", args, SlotSchema);
    if (!slot.ok) return slot;
    return { ok: true as const, release: async () => {
      // A lost cleanup cannot overwrite successful extraction; the lease expires after five minutes.
      await rpc(this.client, "content_release_import", args, z.unknown()).catch(() => undefined);
    } };
  }
}
