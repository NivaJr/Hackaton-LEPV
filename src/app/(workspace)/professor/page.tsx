import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TeacherContentPanel } from "@/features/content/ui/teacher-content-panel";
import { ActivityManager } from "@/features/learning/ui/activity-manager";
import { TeacherOverviewPanel } from "@/features/teacher-dashboard/ui/teacher-overview";
import { loadTeacherOverview } from "@/features/teacher-dashboard/server/load-teacher-overview";
import { getSessionContext, requireRole } from "@/lib/auth/session";

export default async function TeacherPage() {
  const profile = await requireRole("professor");
  const session = await getSessionContext();
  if (!session) redirect("/login?next=%2Fprofessor");
  const overview = await loadTeacherOverview(session);
  const classNames = new Map(overview.classes.map((item) => [item.classId, item.className]));
  const activityScopes = session.teacherAssignments.filter((item) => item.institutionId === session.institutionId)
    .map((item) => ({ classId: item.classId, className: classNames.get(item.classId) ?? "Turma", subjectId: item.subjectId }));
  return <AppShell role="professor" fullName={profile.fullName} mode="real">
    <div className="grid gap-8">
      <TeacherOverviewPanel overview={overview} />
      <div id="questoes" className="scroll-mt-6"><TeacherContentPanel mode="real" /></div>
      <ActivityManager scopes={activityScopes} />
    </div>
  </AppShell>;
}
