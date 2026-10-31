import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/contracts";
import { SessionContextSchema, SubjectIdSchema, type SessionContext } from "@/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRole, roleHome } from "./navigation";

export interface AuthenticatedProfile {
  userId: string;
  schoolId: string;
  fullName: string;
  roles: Role[];
}

export const getOptionalSession = cache(async (): Promise<AuthenticatedProfile | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  // getUser verifies the authenticated identity with Supabase. Browser role metadata is not trusted.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("id, school_id, full_name").eq("id", user.id).single();
  if (profileError || !profile || typeof profile.school_id !== "string" || typeof profile.full_name !== "string") return null;
  const { data: rows, error: rolesError } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id).eq("school_id", profile.school_id);
  if (rolesError) return null;
  const roles = (rows ?? []).map((row: { role: string }) => row.role).filter(isRole);
  if (!roles.length) return null;
  return { userId: user.id, schoolId: profile.school_id, fullName: profile.full_name, roles };
});

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const profile = await getOptionalSession();
  const supabase = await createSupabaseServerClient();
  if (!profile || !supabase) return null;
  const [guardians, teachers] = await Promise.all([
    profile.roles.includes("responsavel")
      ? supabase.from("guardian_links").select("student_id").eq("guardian_id", profile.userId).eq("school_id", profile.schoolId).eq("status", "confirmed")
      : Promise.resolve({ data: [], error: null }),
    profile.roles.includes("professor")
      ? supabase.from("teacher_assignments").select("classroom_id, subject_id").eq("teacher_id", profile.userId).eq("school_id", profile.schoolId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (guardians.error || teachers.error) return null;
  const assignments = (teachers.data ?? []).flatMap((row: { classroom_id: string; subject_id: string }) => {
    const subject = SubjectIdSchema.safeParse(row.subject_id);
    return subject.success ? [{ institutionId: profile.schoolId, classId: row.classroom_id, subjectId: subject.data }] : [];
  });
  return SessionContextSchema.parse({
    userId: profile.userId, roles: profile.roles, institutionId: profile.schoolId,
    studentId: profile.roles.includes("aluno") ? profile.userId : undefined,
    guardianStudentIds: (guardians.data ?? []).map((row: { student_id: string }) => row.student_id),
    teacherAssignments: assignments,
    coordinatorInstitutionIds: profile.roles.includes("coordenador") ? [profile.schoolId] : [],
  });
});

export async function requireRole(role: Role): Promise<AuthenticatedProfile> {
  const session = await getOptionalSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(roleHome(role))}`);
  if (!session.roles.includes(role)) redirect("/sem-acesso");
  return session;
}
