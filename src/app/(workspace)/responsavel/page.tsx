import { AppShell } from "@/components/app-shell";
import { FamilyWorkspace } from "@/features/family/ui/family-workspace";
import { requireRole } from "@/lib/auth/session";

export default async function GuardianPage() {
  const profile = await requireRole("responsavel");
  return <AppShell role="responsavel" fullName={profile.fullName} mode="real"><FamilyWorkspace fullName={profile.fullName} /></AppShell>;
}
