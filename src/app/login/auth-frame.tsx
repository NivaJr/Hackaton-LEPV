import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import styles from "./login.module.css";

export function AuthFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page}>
    <section className={styles.story}>
      <Link href="/" className={styles.brand}><span>✦</span> LEPV</Link>
      <div><div className={styles.tag}><Sparkles size={14} /> Cada aluno, uma jornada.</div><h1>Aprender pode ser uma <em>grande conquista.</em></h1><p>Interesses que viram desafios. Dificuldades que viram oportunidades. Uma escola que acompanha cada passo.</p></div>
      <div className={styles.note}><ShieldCheck size={17} /> Acesso por perfil e vínculo com a escola.</div>
    </section>
    <section className={styles.content}><div className={styles.card}><Link className={styles.back} href="/"><ArrowLeft size={14} /> Voltar ao início</Link>{children}</div></section>
  </main>;
}
