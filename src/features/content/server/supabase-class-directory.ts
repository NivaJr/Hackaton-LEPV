import "server-only";
import { ContentClassSchema, ContentError } from "../model";
import type { ClassDirectory } from "../ports";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Reads classrooms with the user's own session, so RLS (can_read_class) still applies. */
export class SupabaseClassDirectory implements ClassDirectory {
  async hasAssignedTeacher(institutionId: string, classId: string, subjectId: string) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new ContentError("NOT_CONFIGURED", "Configure o Supabase para usar o banco de questões.", 503);
    const { count, error } = await supabase.from("teacher_assignments").select("id", { count: "exact", head: true })
      .eq("school_id", institutionId).eq("classroom_id", classId).eq("subject_id", subjectId);
    if (error) throw new ContentError("CLASSES_UNAVAILABLE", "Não foi possível conferir o professor da disciplina.", 503);
    return (count ?? 0) > 0;
  }
  async listClasses(institutionId: string, classIds?: string[]) {
    if (classIds && !classIds.length) return [];
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new ContentError("NOT_CONFIGURED", "Configure o Supabase para usar o banco de questões.", 503);
    let query = supabase.from("classrooms").select("id, name, grade").eq("school_id", institutionId);
    if (classIds) query = query.in("id", classIds);
    const { data, error } = await query;
    if (error) throw new ContentError("CLASSES_UNAVAILABLE", "Não foi possível carregar as turmas agora.", 503);
    return (data ?? []).flatMap((row: unknown) => {
      const parsed = ContentClassSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }
}
