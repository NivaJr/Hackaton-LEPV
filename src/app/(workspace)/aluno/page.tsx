import { AppShell } from "@/components/app-shell";
import { StudentLearningExperience } from "@/features/learning/ui/student-learning-experience";
import { OwnReportsSection } from "@/features/school-reports/ui/family-reports-list";
import { requireRole } from "@/lib/auth/session";

export default async function StudentPage() {
  const profile = await requireRole("aluno");
  return <AppShell role="aluno" fullName={profile.fullName} mode="real"><StudentLearningExperience fullName={profile.fullName} mode="real" /><OwnReportsSection studentId={profile.userId} /></AppShell>;
}
