import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { signIn } from "./actions";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/auth/navigation";
import styles from "./login.module.css";

const ERRORS: Record<string, string> = {
  invalid: "Confira o email e a senha informados.", credentials: "Não foi possível entrar com essas credenciais.",
  setup: "Configure o Supabase para ativar o login real. A demonstração usa apenas dados fictícios.",
  profile: "Sua conta ainda precisa de perfil e atribuição na escola. Procure o coordenador.",
  invite: "O link não pôde ser validado ou já expirou. Solicite um novo link à escola.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const configured = !!getPublicSupabaseConfig();
  const message = params.error ? ERRORS[params.error] : undefined;
  return <AuthFrame>
    <div className={styles.eyebrow}>Sua próxima conquista começa aqui</div><h2>Bom ter você de volta.</h2>
    <p className={styles.description}>Entre com a conta cadastrada pela sua escola.</p>
    <nav className={styles.tabs} aria-label="Formas de acesso"><Link className={styles.active} href="/login">Entrar</Link><Link href="/primeiro-acesso">Primeiro acesso</Link></nav>
    {!configured && <p className={styles.message}>A base está pronta para conectar ao Supabase. Enquanto isso, explore a demonstração sem usar dados pessoais.</p>}
    {message && <p role="alert" className={`${styles.message} ${styles.error}`}>{message}</p>}
    <form action={signIn} className={styles.form}>
      <input type="hidden" name="next" value={safeInternalPath(params.next, "")} />
      <label className={styles.field}>Email<input type="email" name="email" placeholder="seu.email@escola.com" autoComplete="username" maxLength={254} required /></label>
      <label className={styles.field}>Senha<input type="password" name="password" placeholder="Sua senha" autoComplete="current-password" maxLength={256} required /></label>
      <button className={styles.button} disabled={!configured}>Entrar na minha jornada <ArrowRight size={17} /></button>
    </form>
    <p className={styles.footer}>Conhecendo a plataforma? <Link href="/demo/aluno">Explorar demonstração</Link></p>
  </AuthFrame>;
}
