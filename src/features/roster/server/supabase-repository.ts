import type { SupabaseClient } from "@supabase/supabase-js";
import { SubjectIdSchema, type SubjectId } from "@/contracts";
import { RosterError, type AssignmentRecord, type ClassroomRecord, type EnrollmentRecord, type PersonRecord } from "../model";
import type { RosterRepository } from "../ports";

interface PgFailure { code?: string; message?: string }
interface ClassroomRow { id: string; name: string; grade: number; school_year: number }
interface EnrollmentRow { id: string; classroom_id: string; student_id: string; classrooms: { name: string } | { name: string }[] | null }
interface AssignmentRow { id: string; classroom_id: string; teacher_id: string; subject_id: string }

const CLASSROOM_COLUMNS = "id, name, grade, school_year";
const ENROLLMENT_COLUMNS = "id, classroom_id, student_id, classrooms!inner(name)";

function fail(error: PgFailure): never {
  if (error.code === "23505") throw new RosterError("DUPLICATE", "Este registro já existe.", 409);
  if (error.code === "23503") throw new RosterError("INVALID_REFERENCE", "Registro vinculado a outros dados ou fora desta escola.", 409);
  if (error.code === "23514") throw new RosterError("INVALID_REFERENCE", "A pessoa não tem o papel exigido nesta escola.", 422);
  throw new RosterError("DATABASE_ERROR", "Não foi possível acessar os dados da escola.", 500);
}

const toClassroom = (row: ClassroomRow): ClassroomRecord => ({ id: row.id, name: row.name, grade: row.grade, schoolYear: row.school_year });
const toAssignment = (row: AssignmentRow): AssignmentRecord | null => {
  const subject = SubjectIdSchema.safeParse(row.subject_id);
  return subject.success ? { id: row.id, classroomId: row.classroom_id, teacherId: row.teacher_id, subjectId: subject.data as SubjectId } : null;
};
const toEnrollment = (row: EnrollmentRow): EnrollmentRecord => {
  const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms;
  return { id: row.id, classroomId: row.classroom_id, studentId: row.student_id, classroomName: classroom?.name ?? "" };
};

/** Runs with the coordinator's own session, so RLS and grants still apply to every operation. */
export function createSupabaseRosterRepository(client: SupabaseClient): RosterRepository {
  return {
    async listClassrooms(schoolId) {
      const { data, error } = await client.from("classrooms").select(CLASSROOM_COLUMNS).eq("school_id", schoolId)
        .order("school_year", { ascending: false }).order("name");
      if (error) fail(error);
      return (data as ClassroomRow[]).map(toClassroom);
    },
    async getClassroom(schoolId, classroomId) {
      const { data, error } = await client.from("classrooms").select(CLASSROOM_COLUMNS).eq("school_id", schoolId).eq("id", classroomId).maybeSingle();
      if (error) fail(error);
      return data ? toClassroom(data as ClassroomRow) : null;
    },
    async createClassroom(schoolId, input) {
      const { data, error } = await client.from("classrooms")
        .insert({ school_id: schoolId, name: input.name, grade: input.grade, school_year: input.schoolYear })
        .select(CLASSROOM_COLUMNS).single();
      if (error) fail(error);
      return toClassroom(data as ClassroomRow);
    },
    async updateClassroom(schoolId, classroomId, patch) {
      const { data, error } = await client.from("classrooms")
        .update({ name: patch.name, grade: patch.grade, school_year: patch.schoolYear })
        .eq("school_id", schoolId).eq("id", classroomId).select(CLASSROOM_COLUMNS).maybeSingle();
      if (error) fail(error);
      return data ? toClassroom(data as ClassroomRow) : null;
    },
    async deleteClassroom(schoolId, classroomId) {
      const { data, error } = await client.from("classrooms").delete().eq("school_id", schoolId).eq("id", classroomId).select("id");
      if (error) fail(error);
      return (data ?? []).length > 0;
    },
    async listPeople(schoolId, role) {
      const { data: roles, error } = await client.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", role);
      if (error) fail(error);
      const ids = (roles as { user_id: string }[]).map((row) => row.user_id);
      if (!ids.length) return [];
      const { data, error: profileError } = await client.from("profiles").select("id, full_name").eq("school_id", schoolId).in("id", ids).order("full_name");
      if (profileError) fail(profileError);
      return (data as { id: string; full_name: string }[]).map((row): PersonRecord => ({ id: row.id, fullName: row.full_name }));
    },
    async listEnrollments(schoolId) {
      const { data, error } = await client.from("enrollments").select(ENROLLMENT_COLUMNS).eq("school_id", schoolId).eq("status", "active");
      if (error) fail(error);
      return (data as EnrollmentRow[]).map(toEnrollment);
    },
    async activeEnrollment(schoolId, studentId) {
      const { data, error } = await client.from("enrollments").select(ENROLLMENT_COLUMNS)
        .eq("school_id", schoolId).eq("student_id", studentId).eq("status", "active").maybeSingle();
      if (error) fail(error);
      return data ? toEnrollment(data as EnrollmentRow) : null;
    },
    async enroll(schoolId, classroomId, studentId) {
      const { data, error } = await client.from("enrollments")
        .insert({ school_id: schoolId, classroom_id: classroomId, student_id: studentId })
        .select(ENROLLMENT_COLUMNS).single();
      if (error?.code === "23505") throw new RosterError("DUPLICATE_ENROLLMENT", "O aluno já tem uma matrícula ativa.", 409);
      if (error) fail(error);
      return toEnrollment(data as EnrollmentRow);
    },
    async closeEnrollment(schoolId, enrollmentId, status) {
      const { data, error } = await client.from("enrollments").update({ status, ended_at: new Date().toISOString() })
        .eq("school_id", schoolId).eq("id", enrollmentId).eq("status", "active").select("id");
      if (error) fail(error);
      return (data ?? []).length > 0;
    },
    async reopenEnrollment(schoolId, enrollmentId) {
      const { error } = await client.from("enrollments").update({ status: "active", ended_at: null })
        .eq("school_id", schoolId).eq("id", enrollmentId);
      if (error) fail(error);
    },
    async listAssignments(schoolId) {
      const { data, error } = await client.from("teacher_assignments").select("id, classroom_id, teacher_id, subject_id").eq("school_id", schoolId);
      if (error) fail(error);
      return (data as AssignmentRow[]).flatMap((row) => toAssignment(row) ?? []);
    },
    async createAssignment(schoolId, input) {
      const { data, error } = await client.from("teacher_assignments")
        .insert({ school_id: schoolId, classroom_id: input.classroomId, teacher_id: input.teacherId, subject_id: input.subjectId })
        .select("id, classroom_id, teacher_id, subject_id").single();
      if (error) fail(error);
      return toAssignment(data as AssignmentRow)!;
    },
    async deleteAssignment(schoolId, assignmentId) {
      const { data, error } = await client.from("teacher_assignments").delete().eq("school_id", schoolId).eq("id", assignmentId).select("id");
      if (error) fail(error);
      return (data ?? []).length > 0;
    },
  };
}
