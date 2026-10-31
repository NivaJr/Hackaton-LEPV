import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { requireRole } from "@/lib/auth/session";

export default async function GuardianPage() {
  const profile = await requireRole("responsavel");
  return <AppShell role="responsavel" fullName={profile.fullName} mode="real"><Dashboard role="responsavel" fullName={profile.fullName} mode="real" /></AppShell>;
}
