import { z } from "zod";
import { StudentPreferencesSchema, type StudentPreferencesUpdate } from "@/contracts";
import {
  LearningError, LearningStateSchema, LoadedStudentSchema, RankingRowSchema, VersionedCatalogSchema,
  type LearningState, type LoadedStudent, type VersionedCatalog,
} from "./model";
import type { LearningRepository } from "./repository";

export interface LearningRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

/** No in-memory fallback. The privileged client stays in the server runtime factory. */
export class SupabaseLearningRepository implements LearningRepository {
  constructor(private readonly client: LearningRpcClient) {}

  private async rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      if (error.message.includes("LEARNING_NOT_FOUND")) throw new LearningError("NOT_FOUND", "Recurso não encontrado para esta conta.", 404);
      if (error.message.includes("LEARNING_CLASS_CHANGED")) throw new LearningError("CLASS_CHANGED", "O ano da turma mudou; a seleção de atividades precisa ser revista.");
      if (error.code === "23505") throw new LearningError("PERSISTENCE_CONFLICT", "Esta operação já foi registrada. Recarregue o progresso.");
      throw new LearningError("PERSISTENCE_UNAVAILABLE", "A persistência não está disponível. Verifique a migração e a configuração do servidor.", 503, { cause: error });
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new LearningError("INVALID_PERSISTED_STATE", "O estado persistido não corresponde à versão atual dos contratos.", 503, { cause: parsed.error });
    return parsed.data;
  }

  loadStudent(institutionId: string, studentId: string) {
    return this.rpc("learning_read_student", { p_school: institutionId, p_student: studentId }, LoadedStudentSchema);
  }
  commitStudent(before: LoadedStudent, state: LearningState) {
    return this.rpc("learning_commit_student", {
      p_school: before.institutionId, p_student: before.studentId,
      p_expected_version: before.stateVersion, p_catalog_version: before.catalogVersion,
      p_state: LearningStateSchema.parse(state),
    }, z.boolean());
  }
  savePreferences(institutionId: string, studentId: string, value: StudentPreferencesUpdate) {
    return this.rpc("learning_save_preferences", { p_school: institutionId, p_student: studentId, p_preferences: value }, StudentPreferencesSchema);
  }
  loadCatalog(institutionId: string, classId: string) {
    return this.rpc("learning_read_catalog", { p_school: institutionId, p_class: classId }, VersionedCatalogSchema);
  }
  commitCatalog(before: VersionedCatalog, after: VersionedCatalog["catalog"]) {
    return this.rpc("learning_commit_catalog", {
      p_school: before.catalog.institutionId, p_class: before.catalog.classId,
      p_expected_version: before.version, p_catalog: after,
    }, z.boolean());
  }
  ranking(institutionId: string, classId: string) {
    return this.rpc("learning_class_ranking", { p_school: institutionId, p_class: classId }, z.array(RankingRowSchema).max(10));
  }
}
