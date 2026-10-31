import type { SupabaseClient } from "@supabase/supabase-js";
import { FamilyError, type ChildRecord, type FamilyRecord, type FamilyRecordCategory, type HistoryEntry } from "../model";
import type { FamilyRepository } from "../ports";

const TABLES: Record<FamilyRecordCategory, string> = { health: "student_health", support: "student_support" };

interface HistoryRow { id: string; subject_id: string; school_year: number; period: string; grade: number | null; notes: string }
interface EnrollmentRow {
  student_id: string;
  classrooms: { name: string; grade: number } | { name: string; grade: number }[] | null;
}

function fail(): never {
  throw new FamilyError("DATABASE_ERROR", "Não foi possível acessar os dados do aluno.", 500);
}

const toRecord = (row: { details: string; updated_at: string } | null): FamilyRecord => ({ details: row?.details ?? "", updatedAt: row?.updated_at ?? null });

/** Uses the guardian's session: RLS repeats the link check made by FamilyService. */
export function createSupabaseFamilyRepository(client: SupabaseClient): FamilyRepository {
  return {
    async getChildren(schoolId, studentIds) {
      if (!studentIds.length) return [];
      const [profiles, enrollments] = await Promise.all([
        client.from("profiles").select("id, full_name").eq("school_id", schoolId).in("id", studentIds).order("full_name"),
        client.from("enrollments").select("student_id, classrooms!inner(name, grade)").eq("school_id", schoolId).eq("status", "active").in("student_id", studentIds),
      ]);
      if (profiles.error || enrollments.error) fail();
      const rows = (enrollments.data ?? []) as EnrollmentRow[];
      return ((profiles.data ?? []) as { id: string; full_name: string }[]).map((profile): ChildRecord => {
        const joined = rows.find((row) => row.student_id === profile.id)?.classrooms;
        const classroom = Array.isArray(joined) ? joined[0] : joined;
        return { id: profile.id, fullName: profile.full_name, classroomName: classroom?.name ?? null, grade: classroom?.grade ?? null };
      });
    },
    async getRecord(schoolId, studentId, category) {
      const { data, error } = await client.from(TABLES[category]).select("details, updated_at")
        .eq("school_id", schoolId).eq("student_id", studentId).maybeSingle();
      if (error) fail();
      return toRecord(data as { details: string; updated_at: string } | null);
    },
    /** No generic upsert: identity columns have no UPDATE grant, so only details is ever updated. */
    async saveRecord(schoolId, studentId, category, details) {
      const update = () => client.from(TABLES[category]).update({ details })
        .eq("school_id", schoolId).eq("student_id", studentId).select("details, updated_at").maybeSingle();
      const updated = await update();
      if (updated.error) fail();
      if (updated.data) return toRecord(updated.data as { details: string; updated_at: string });
      const inserted = await client.from(TABLES[category]).insert({ school_id: schoolId, student_id: studentId, details })
        .select("details, updated_at").maybeSingle();
      if (inserted.error?.code === "23505") {
        const retried = await update();
        if (retried.error || !retried.data) fail();
        return toRecord(retried.data as { details: string; updated_at: string });
      }
      // Zero rows after RLS is a refusal, not a success.
      if (inserted.error || !inserted.data) fail();
      return toRecord(inserted.data as { details: string; updated_at: string });
    },
    async getHistory(schoolId, studentId) {
      const { data, error } = await client.from("academic_history").select("id, subject_id, school_year, period, grade, notes")
        .eq("school_id", schoolId).eq("student_id", studentId).order("school_year", { ascending: false }).order("subject_id");
      if (error) fail();
      return ((data ?? []) as HistoryRow[]).map((row): HistoryEntry => ({
        id: row.id, subjectId: row.subject_id, schoolYear: row.school_year, period: row.period,
        grade: row.grade === null ? null : Number(row.grade), notes: row.notes,
      }));
    },
  };
}
