import Link from "next/link";
import { AuthFrame } from "../login/auth-frame";
import { defineFirstPassword } from "../login/actions";
import { getOptionalSession } from "@/lib/auth/session";
import styles from "../login/login.module.css";

export default async function FirstAccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, params] = await Promise.all([getOptionalSession(), searchParams]);
  return <AuthFrame>
    <div className={styles.eyebrow}>Primeiro acesso</div><h2>Vamos começar sua jornada.</h2>
    <p className={styles.description}>A escola cadastra sua conta e fornece um convite. Após validar esse acesso, você define uma senha pessoal.</p>
    <nav className={styles.tabs} aria-label="Formas de acesso"><Link href="/login">Entrar</Link><Link className={styles.active} href="/primeiro-acesso">Primeiro acesso</Link></nav>
    {params.error && <p role="alert" className={`${styles.message} ${styles.error}`}>Não foi possível concluir. Confira o convite e use senhas iguais, com pelo menos 12 caracteres.</p>}
    {session ? <form action={defineFirstPassword} className={styles.form}>
      <p className={styles.small}>Conta validada: {session.fullName}</p>
      <label className={styles.field}>Nova senha<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <label className={styles.field}>Repita a senha<input type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <button className={styles.button}>Definir minha senha</button>
    </form> : <div className={styles.message}>Abra o link de convite fornecido pela escola para ativar esta etapa. Informar somente um email não permite assumir uma conta.</div>}
    <p className={styles.footer}><Link href="/demo/aluno">Conhecer a demonstração</Link></p>
  </AuthFrame>;
}
