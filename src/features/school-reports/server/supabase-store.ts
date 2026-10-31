import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_REPORT_BYTES, SchoolReportError, type SchoolReportFile } from "../model";
import type { SchoolReportStore } from "../ports";

const BUCKET = "boletins";
const LIST_LIMIT = 100;
const NAME_PATTERN = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]+)\.pdf$/;

function unavailable(step: string, error: { message?: string }): never {
  console.error(`Supabase Storage: falha em ${step}`, { message: error.message });
  throw new SchoolReportError("STORE_UNAVAILABLE", "Os boletins não estão disponíveis agora. Tente novamente.", 503);
}

/** The label lives in the object name, so the feature needs no table or migration. */
export function reportObjectName(id: string, label: string) {
  return `${id}.${Buffer.from(label).toString("base64url")}.pdf`;
}

function toReport(file: { name: string; created_at?: string | null; metadata?: { size?: number } | null }): SchoolReportFile | null {
  const match = NAME_PATTERN.exec(file.name);
  if (!match) return null;
  return { id: match[1], label: Buffer.from(match[2], "base64url").toString(), uploadedAt: file.created_at ?? "", sizeBytes: file.metadata?.size ?? 0 };
}

/**
 * Privileged adapter over a private bucket: no policy opens it to browsers, so every file
 * passes through SchoolReportService, which checks the session and the guardian link.
 */
export function createSupabaseSchoolReportStore(admin: SupabaseClient): SchoolReportStore {
  const bucket = admin.storage.from(BUCKET);
  const folder = (schoolId: string, studentId: string) => `${schoolId}/${studentId}`;

  async function objects(schoolId: string, studentId: string) {
    const { data, error } = await bucket.list(folder(schoolId, studentId), { limit: LIST_LIMIT, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      if (/not found/i.test(error.message)) return [];
      unavailable("listar boletins", error);
    }
    return data ?? [];
  }

  async function objectName(schoolId: string, studentId: string, fileId: string) {
    return (await objects(schoolId, studentId)).find((item) => toReport(item)?.id === fileId)?.name ?? null;
  }

  async function ensureBucket() {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_REPORT_BYTES, allowedMimeTypes: ["application/pdf"] });
    if (error && !/already exists/i.test(error.message)) unavailable("criar o armazenamento", error);
  }

  return {
    async isStudentOfSchool(schoolId, studentId) {
      const { count, error } = await admin.from("user_roles").select("user_id", { count: "exact", head: true })
        .eq("school_id", schoolId).eq("user_id", studentId).eq("role", "aluno");
      if (error) unavailable("conferir o aluno", error);
      return (count ?? 0) > 0;
    },

    async activeClassId(schoolId, studentId) {
      const { data, error } = await admin.from("enrollments").select("classroom_id")
        .eq("school_id", schoolId).eq("student_id", studentId).eq("status", "active").maybeSingle();
      if (error) unavailable("conferir a turma", error);
      return (data as { classroom_id: string } | null)?.classroom_id ?? null;
    },

    async listClassStudents(schoolId, classId) {
      const enrolled = await admin.from("enrollments").select("student_id").eq("school_id", schoolId).eq("classroom_id", classId).eq("status", "active");
      if (enrolled.error) unavailable("listar os alunos", enrolled.error);
      const ids = (enrolled.data as { student_id: string }[]).map((row) => row.student_id);
      if (!ids.length) return [];
      const { data, error } = await admin.from("profiles").select("id, full_name").eq("school_id", schoolId).in("id", ids).order("full_name");
      if (error) unavailable("listar os alunos", error);
      return (data as { id: string; full_name: string }[]).map((row) => ({ id: row.id, fullName: row.full_name }));
    },

    async list(schoolId, studentId) {
      return (await objects(schoolId, studentId)).flatMap((item) => toReport(item) ?? []);
    },

    async save(schoolId, studentId, { id, label, bytes }) {
      const name = reportObjectName(id, label);
      const path = `${folder(schoolId, studentId)}/${name}`;
      const upload = () => bucket.upload(path, bytes, { contentType: "application/pdf", upsert: false });
      let { error } = await upload();
      if (error && /not found/i.test(error.message)) {
        await ensureBucket();
        ({ error } = await upload());
      }
      if (error) unavailable("salvar o boletim", error);
      return { id, label, uploadedAt: new Date().toISOString(), sizeBytes: bytes.length };
    },

    async read(schoolId, studentId, fileId) {
      const name = await objectName(schoolId, studentId, fileId);
      if (!name) return null;
      const { data, error } = await bucket.download(`${folder(schoolId, studentId)}/${name}`);
      if (error) unavailable("abrir o boletim", error);
      return new Uint8Array(await data.arrayBuffer());
    },

    async remove(schoolId, studentId, fileId) {
      const name = await objectName(schoolId, studentId, fileId);
      if (!name) return false;
      const { error } = await bucket.remove([`${folder(schoolId, studentId)}/${name}`]);
      if (error) unavailable("remover o boletim", error);
      return true;
    },
  };
}
