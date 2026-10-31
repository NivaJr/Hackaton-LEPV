import "server-only";
import { GradeSchema } from "@/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClassRoster, ClassRosterSource } from "../adapters/learning";

/** Reads with the teacher's own session, so RLS limits rows to assigned classes. */
export function createSupabaseClassRosterSource(): ClassRosterSource {
  return {
    async getClassRoster(institutionId, classId): Promise<ClassRoster | null> {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return null;
      const { data: classroom, error: classError } = await supabase
        .from("classrooms").select("id, name, grade").eq("id", classId).eq("school_id", institutionId).maybeSingle();
      const grade = GradeSchema.safeParse(classroom?.grade);
      if (classError || !classroom || !grade.success) return null;
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("enrollments").select("student_id")
        .eq("classroom_id", classId).eq("school_id", institutionId).eq("status", "active");
      if (enrollmentError) return null;
      const studentIds = (enrollments ?? []).map((row: { student_id: string }) => row.student_id);
      const names = new Map<string, string>();
      if (studentIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles").select("id, full_name").eq("school_id", institutionId).in("id", studentIds);
        if (profileError) return null;
        for (const row of (profiles ?? []) as Array<{ id: string; full_name: string }>) names.set(row.id, row.full_name);
      }
      return {
        classId: classroom.id as string,
        className: classroom.name as string,
        grade: grade.data,
        students: studentIds
          .map((studentId) => ({ studentId, displayName: names.get(studentId) ?? "Aluno sem nome cadastrado" }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR")),
      };
    },
  };
}
