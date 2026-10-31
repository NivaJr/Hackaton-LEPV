import { AppShell } from "@/components/app-shell";
import { StudentLearningExperience } from "@/features/learning/ui/student-learning-experience";
import { deriveAccessibilityNeedsFromSupport } from "@/features/learning/ui/accessibility-preferences";
import { OwnReportsSection } from "@/features/school-reports/ui/family-reports-list";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function StudentPage() {
  const profile = await requireRole("aluno");
  const supabase = await createSupabaseServerClient();
  const support = supabase ? await supabase.from("student_support").select("details")
    .eq("student_id", profile.userId).eq("school_id", profile.schoolId).maybeSingle() : null;
  const details = support?.error ? "" : support?.data?.details;
  const registeredAccessibilityNeeds = deriveAccessibilityNeedsFromSupport(typeof details === "string" ? details : "");
  return <AppShell role="aluno" fullName={profile.fullName} mode="real"><StudentLearningExperience fullName={profile.fullName} mode="real" registeredAccessibilityNeeds={registeredAccessibilityNeeds} /><OwnReportsSection studentId={profile.userId} /></AppShell>;
}
