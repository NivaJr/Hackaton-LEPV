import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, getSessionContext } from "@/lib/auth/session";
import { RecognitionError } from "@/features/recognition/model";
import { createRecognitionService } from "@/features/recognition/server/runtime";
import { NotificationBell } from "@/features/recognition/ui/notification-bell";
import { RecognizePanel, type TeacherAssignmentOption } from "@/features/recognition/ui/recognize-panel";
import styles from "@/features/recognition/ui/recognition.module.css";

export const metadata: Metadata = {
  title: "Dar pontos",
  description: "Professor reconhece comportamento positivo em aula pelo celular.",
  manifest: "/professor/reconhecer/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EAI Pontos", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0B2161", width: "device-width", initialScale: 1 };

export default async function RecognizePage() {
  await requireRole("professor");
  const actor = await getSessionContext();
  let assignments: TeacherAssignmentOption[] = [];
  let problem: string | null = null;
  if (!actor) {
    problem = "Não conseguimos carregar suas turmas. Saia e entre de novo.";
  } else {
    try {
      assignments = await createRecognitionService().listAssignments(actor);
    } catch (error) {
      problem = error instanceof RecognitionError ? error.message : "Não conseguimos carregar suas turmas agora.";
    }
  }
  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerRow}>
        <Link href="/professor" className={styles.backLink}><ArrowLeft size={18} aria-hidden="true" />Painel</Link>
        <span className={styles.brandTag}>EAI</span>
        <NotificationBell />
      </div>
      <h1 className={styles.title}>Pontos por atitude em aula</h1>
      <p className={styles.subtitle}>Cada elogio vale 20 pontos de patente. Até 3 por aluno no dia.</p>
    </header>
    {problem
      ? <main className={styles.main} id="conteudo"><p className={`${styles.notice} ${styles.error}`} role="alert">{problem}</p></main>
      : <RecognizePanel assignments={assignments} />}
  </div>;
}
