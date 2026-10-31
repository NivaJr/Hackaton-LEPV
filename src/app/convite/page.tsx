import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "../login/auth-frame";
import { acceptInvite } from "../login/actions";
import { getOptionalSession } from "@/lib/auth/session";
import styles from "../login/login.module.css";

// The address carries a one-time token: it must not leak through Referer or search engines.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const [session, { token_hash: tokenHash, type }] = await Promise.all([getOptionalSession(), searchParams]);
  const valid = typeof tokenHash === "string" && (type === "invite" || type === "recovery");
  return <AuthFrame>
    <div className={styles.eyebrow}>Cadastro</div><h2>Vamos ativar sua conta.</h2>
    {valid ? <form action={acceptInvite} className={styles.form}>
      <p className={styles.description}>Este link foi criado pela sua escola e funciona uma vez. Continue para definir sua senha.</p>
      {session && <p className={styles.small}>Você está conectado como {session.fullName}. Ao continuar, esta sessão será trocada pela conta do link.</p>}
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <button className={styles.button}>Continuar</button>
    </form> : <div className={styles.message}>Este link está incompleto. Solicite um novo link à escola.</div>}
    <p className={styles.footer}><Link href="/login">Já tenho senha</Link></p>
  </AuthFrame>;
}
