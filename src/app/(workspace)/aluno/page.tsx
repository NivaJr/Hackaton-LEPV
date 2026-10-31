import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { requireRole } from "@/lib/auth/session";

export default async function StudentPage() {
  const profile = await requireRole("aluno");
  return <AppShell role="aluno" fullName={profile.fullName} mode="real"><Dashboard role="aluno" fullName={profile.fullName} mode="real" /></AppShell>;
}
