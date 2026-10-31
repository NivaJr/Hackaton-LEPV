"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import styles from "./roster.module.css";

export interface IssuedLink { name: string; link: string; }

export const ACCESS_LINK_WARNING = "Cada link é pessoal, funciona uma vez e expira. Ele não fica salvo: guarde ou repasse agora. Para testar, abra em janela anônima, pois o link troca a conta conectada.";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }
  return <button type="button" className={styles.link} onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar link"}</button>;
}

export function AccessLinkNotice({ issued, onClose }: { issued: IssuedLink; onClose(): void }) {
  return <section className={`panel ${styles.linkNotice}`} aria-label="Link de cadastro">
    <div className={styles.row}>
      <span><strong>Link de cadastro de {issued.name}</strong><small>{ACCESS_LINK_WARNING}</small></span>
      <span className={styles.actions}><CopyLinkButton link={issued.link} /><button type="button" className={styles.link} aria-label="Fechar" onClick={onClose}><X size={14} /></button></span>
    </div>
  </section>;
}
