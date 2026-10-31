import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { TeacherContentPanel } from "@/features/content/ui/teacher-content-panel";
import { StudentLearningExperience } from "@/features/learning/ui/student-learning-experience";
import { isRole } from "@/lib/auth/navigation";
import type { Role } from "@/contracts";

const DEMO_NAMES: Record<Role, string> = { aluno: "Ana Lima", professor: "Pedro Almeida", coordenador: "Marina Costa", responsavel: "Juliana Lima" };

export default async function DemoPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  if (role === "aluno") {
    return <AppShell role="aluno" fullName={DEMO_NAMES.aluno} mode="demo"><StudentLearningExperience fullName={DEMO_NAMES.aluno} mode="demo" registeredAccessibilityNeeds={["reading", "focus", "predictability"]} /></AppShell>;
  }
  if (role === "professor") {
    return <AppShell role="professor" fullName={DEMO_NAMES.professor} mode="demo"><TeacherContentPanel mode="demo" /></AppShell>;
  }
  return <AppShell role={role} fullName={DEMO_NAMES[role]} mode="demo"><Dashboard role={role} fullName={DEMO_NAMES[role]} mode="demo" /></AppShell>;
}
