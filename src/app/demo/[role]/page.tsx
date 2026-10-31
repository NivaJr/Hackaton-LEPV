import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { isRole } from "@/lib/auth/navigation";
import type { Role } from "@/contracts";

const DEMO_NAMES: Record<Role, string> = { aluno: "Ana Lima", professor: "Pedro Almeida", coordenador: "Marina Costa", responsavel: "Juliana Lima" };

export default async function DemoPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  return <AppShell role={role} fullName={DEMO_NAMES[role]} mode="demo"><Dashboard role={role} fullName={DEMO_NAMES[role]} mode="demo" /></AppShell>;
}
