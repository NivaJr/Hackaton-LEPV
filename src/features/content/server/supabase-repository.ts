import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ContentError, ContentQuestionSchema, type ContentQuestion } from "../model";
import type { ContentRepository } from "../ports";

/** Every query uses the authenticated staff session and the table's school/class/subject RLS. */
export class SupabaseContentRepository implements ContentRepository {
  readonly storage = "supabase" as const;
  constructor(private readonly getClient: () => Promise<SupabaseClient | null> = createSupabaseServerClient) {}

  private async client() {
    const client = await this.getClient();
    if (!client) throw new ContentError("NOT_CONFIGURED", "Configure o Supabase para salvar as listas.", 503);
    return client;
  }

  private check(error: { code?: string; message: string } | null) {
    if (!error) return;
    if (error.code === "42501") throw new ContentError("CONTENT_FORBIDDEN", "Você não pode alterar o conteúdo desta turma e disciplina.", 403);
    if (error.code === "23505") throw new ContentError("DUPLICATE_ID", "Esta questão já foi registrada.");
    throw new ContentError("CONTENT_PERSISTENCE_UNAVAILABLE", "Não foi possível salvar a lista. Confira a conexão e as migrações do banco.", 503, undefined, { cause: error });
  }

  private row(value: ContentQuestion) {
    const item = ContentQuestionSchema.parse(value);
    return { id: item.id, school_id: item.institutionId, classroom_id: item.classId, subject_id: item.body.subjectId,
      created_by: item.createdBy, version: item.version, status: item.status, payload: item, created_at: item.createdAt };
  }

  async list(filter: { institutionId: string; classId: string; subjectId: string }) {
    const client = await this.client();
    const { data, error } = await client.from("content_questions").select("payload").eq("school_id", filter.institutionId)
      .eq("classroom_id", filter.classId).eq("subject_id", filter.subjectId).order("created_at").order("id");
    this.check(error);
    return (data ?? []).map((row) => ContentQuestionSchema.parse(row.payload));
  }

  async get(institutionId: string, id: string) {
    const client = await this.client();
    const { data, error } = await client.from("content_questions").select("payload").eq("school_id", institutionId).eq("id", id).maybeSingle();
    this.check(error);
    return data ? ContentQuestionSchema.parse(data.payload) : null;
  }

  async insert(items: ContentQuestion[]) {
    if (!items.length) return;
    const client = await this.client();
    const { error } = await client.from("content_questions").insert(items.map((item) => this.row(item)));
    this.check(error);
  }

  async replace(item: ContentQuestion, expectedVersion: number) {
    const client = await this.client();
    const { data, error } = await client.from("content_questions").update(this.row(item)).eq("school_id", item.institutionId)
      .eq("id", item.id).eq("version", expectedVersion).select("id");
    this.check(error);
    return (data?.length ?? 0) === 1;
  }

  async remove(institutionId: string, id: string, expectedVersion: number) {
    const client = await this.client();
    const { data, error } = await client.from("content_questions").delete().eq("school_id", institutionId).eq("id", id)
      .eq("version", expectedVersion).eq("status", "rascunho").select("id");
    this.check(error);
    return (data?.length ?? 0) === 1;
  }
}
