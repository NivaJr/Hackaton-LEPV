import { AppShell } from "@/components/app-shell";
import { TeacherContentWorkspace } from "@/features/content/ui/teacher-content-workspace";
import { getSessionContext, requireRole } from "@/lib/auth/session";

export default async function TeacherPage() {
  const profile = await requireRole("professor");
  const context = await getSessionContext();
  const assignments = (context?.teacherAssignments ?? []).map((assignment) => ({
    classId: assignment.classId,
    className: `Turma ${assignment.classId}`,
    subjectId: assignment.subjectId,
  }));
  return <AppShell role="professor" fullName={profile.fullName} mode="real"><TeacherContentWorkspace fullName={profile.fullName} mode="real" assignments={assignments} /></AppShell>;
}
