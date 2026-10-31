import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { requireRole } from "@/lib/auth/session";

export default async function TeacherPage() {
  const profile = await requireRole("professor");
  return <AppShell role="professor" fullName={profile.fullName} mode="real"><Dashboard role="professor" fullName={profile.fullName} mode="real" /></AppShell>;
}
