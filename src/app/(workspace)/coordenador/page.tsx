import { AppShell } from "@/components/app-shell";
import { ActivationPanel } from "@/features/activation/ui/activation-panel";
import { CoordinatorWorkspace } from "@/features/roster/ui/coordinator-workspace";
import { requireRole } from "@/lib/auth/session";

export default async function CoordinatorPage() {
  const profile = await requireRole("coordenador");
  return <AppShell role="coordenador" fullName={profile.fullName} mode="real"><CoordinatorWorkspace fullName={profile.fullName} schoolYear={new Date().getFullYear()} /><ActivationPanel /></AppShell>;
}
