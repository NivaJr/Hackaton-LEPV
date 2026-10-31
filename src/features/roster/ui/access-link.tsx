"use client";

import { useState } from "react";
import { Check, Copy, Download, Link2, X } from "lucide-react";
import { accessLinksCsv } from "../import/rows";
import type { ClassAccessLinks } from "../model";
import { rosterApi } from "./api";
import styles from "./roster.module.css";

export interface IssuedLink { name: string; link: string; }

export const ACCESS_LINK_WARNING = "Cada link é pessoal, funciona uma vez e expira. Ele não fica salvo: guarde ou repasse agora. Para testar, abra em janela anônima, pois o link troca a conta conectada.";

export function downloadAccessLinks(rows: ClassAccessLinks["links"], classroomName: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", accessLinksCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `links-de-cadastro-${classroomName}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }
  return <button type="button" className={styles.link} onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar link"}</button>;
}

/** Links are created on demand because they are never stored and expire. */
export function ClassAccessLinksPanel({ classroomId, classroomName }: { classroomId: string; classroomName: string }) {
  const [issued, setIssued] = useState<ClassAccessLinks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!window.confirm("Gerar novos links? Os links já repassados de quem ainda não se cadastrou deixam de valer.")) return;
    setBusy(true);
    setError(null);
    try { setIssued(await rosterApi.classAccessLinks(classroomId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar os links."); }
    finally { setBusy(false); }
  }

  return <>
    <h3>Links de cadastro</h3>
    <p className={styles.hint}>Alunos e professores desta turma que ainda não ativaram a conta entram por estes links.</p>
    <div className={styles.actions}>
      <button type="button" className="button button-outline" disabled={busy} onClick={() => void generate()}><Link2 size={14} /> {busy ? "Gerando…" : "Gerar links da turma"}</button>
      {issued && issued.links.length > 0 && <button type="button" className="button button-outline" onClick={() => downloadAccessLinks(issued.links, classroomName)}><Download size={14} /> Baixar planilha (CSV)</button>}
    </div>
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {issued && issued.links.length > 0 && <p className={styles.notice}>{ACCESS_LINK_WARNING}</p>}
    {issued?.links.map((item) => <div className={styles.row} key={item.email}><span>{item.fullName}<small>{item.email}</small></span><CopyLinkButton link={item.accessLink} /></div>)}
    {issued && <p className={styles.hint}>{issued.links.length} link(s) gerado(s). {issued.activeCount} pessoa(s) já ativaram a conta.</p>}
  </>;
}

export function AccessLinkNotice({ issued, onClose }: { issued: IssuedLink; onClose(): void }) {
  return <section className={`panel ${styles.linkNotice}`} aria-label="Link de cadastro">
    <div className={styles.row}>
      <span><strong>Link de cadastro de {issued.name}</strong><small>{ACCESS_LINK_WARNING}</small></span>
      <span className={styles.actions}><CopyLinkButton link={issued.link} /><button type="button" className={styles.link} aria-label="Fechar" onClick={onClose}><X size={14} /></button></span>
    </div>
  </section>;
}
