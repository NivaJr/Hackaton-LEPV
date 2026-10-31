import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { TeacherContentWorkspace } from "@/features/content/ui/teacher-content-workspace";
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
    const assignments = [
      { classId: "7-a", className: "7º ano A", subjectId: "portugues" as const },
      { classId: "7-b", className: "7º ano B", subjectId: "portugues" as const },
      { classId: "8-a", className: "8º ano A", subjectId: "matematica" as const },
    ];
    return <AppShell role="professor" fullName={DEMO_NAMES.professor} mode="demo"><TeacherContentWorkspace fullName={DEMO_NAMES.professor} mode="demo" assignments={assignments} /></AppShell>;
  }
  return <AppShell role={role} fullName={DEMO_NAMES[role]} mode="demo"><Dashboard role={role} fullName={DEMO_NAMES[role]} mode="demo" /></AppShell>;
}
