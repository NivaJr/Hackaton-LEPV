import "server-only";
import type { SessionContext } from "@/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ContentError } from "../model";
import type { ContentFileStore } from "../ports";

/** Private originals remain accessible only to authorized staff through Storage RLS. */
export class SupabaseContentFiles implements ContentFileStore {
  async save(actor: SessionContext, input: { classId: string; subjectId: string; kind: "pdf" | "docx"; bytes: Uint8Array }) {
    const client = await createSupabaseServerClient();
    if (!client) throw new ContentError("NOT_CONFIGURED", "Configure o Supabase para guardar a lista original.", 503);
    const path = `${actor.institutionId}/${input.classId}/${input.subjectId}/${crypto.randomUUID()}.${input.kind}`;
    const { error } = await client.storage.from("teaching-sources").upload(path, input.bytes, {
      contentType: input.kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (error) throw new ContentError("SOURCE_STORAGE_UNAVAILABLE", "Não foi possível guardar a lista original. Confira a conexão e a configuração do armazenamento.", 503, undefined, { cause: error });
    return path;
  }
}
