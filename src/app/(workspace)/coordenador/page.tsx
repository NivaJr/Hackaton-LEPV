import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { requireRole } from "@/lib/auth/session";

export default async function CoordinatorPage() {
  const profile = await requireRole("coordenador");
  return <AppShell role="coordenador" fullName={profile.fullName} mode="real"><Dashboard role="coordenador" fullName={profile.fullName} mode="real" /></AppShell>;
}
