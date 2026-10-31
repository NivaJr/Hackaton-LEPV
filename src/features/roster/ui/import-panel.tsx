"use client";

import { useState, type FormEvent } from "react";
import { Download, UploadCloud } from "lucide-react";
import { TEMPLATES } from "../import/rows";
import type { ConfirmStatus, ImportConfirmRow, ImportKind, ImportPreview, ImportResult, PreviewRow, PreviewStatus } from "../model";
import { ACCESS_LINK_WARNING, CopyLinkButton, downloadAccessLinks } from "./access-link";
import { rosterApi } from "./api";
import styles from "./roster.module.css";

const STATUS_LABELS: Record<PreviewStatus, string> = {
  new: "Nova conta e link", enroll_existing: "Matricular conta existente", already_in_class: "Já está na turma",
  transfer_available: "Em outra turma", assign_existing: "Atribuir conta existente", already_assigned: "Já atribuído", invalid: "Com erro",
};
const RESULT_LABELS: Record<ConfirmStatus, string> = {
  created: "Criado", enrolled: "Matriculado", transferred: "Transferido", assigned: "Atribuído",
  kept: "Mantido", already_applied: "Já aplicado", failed: "Falhou",
};

function badge(status: PreviewStatus | ConfirmStatus) {
  if (status === "invalid" || status === "failed") return `${styles.badge} ${styles.badgeError}`;
  if (status === "transfer_available") return `${styles.badge} ${styles.badgeWarn}`;
  return styles.badge;
}

type Decision = "transfer" | "keep";

export function ImportPanel({ classroomId, classroomName, onApplied }: { classroomId: string; classroomName: string; onApplied(): void }) {
  const [kind, setKind] = useState<ImportKind>("students");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionable = preview?.rows.filter((row) => row.status !== "invalid") ?? [];
  const undecided = actionable.filter((row) => row.status === "transfer_available" && !decisions[row.line]).length;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação."); }
    finally { setBusy(false); }
  }

  function submitPreview(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    void run(async () => {
      setResult(null);
      setDecisions({});
      setPreview(await rosterApi.preview(kind, classroomId, file));
    });
  }

  function toConfirmRow(row: PreviewRow): ImportConfirmRow {
    const decision = decisions[row.line];
    return {
      line: row.line, fullName: row.fullName, email: row.email, ...(row.subject ? { subject: row.subject } : {}),
      decision: decision ?? "apply", ...(decision === "transfer" ? { expectedEnrollmentId: row.currentEnrollment?.id ?? null } : {}),
    };
  }

  function confirm(rows: PreviewRow[]) {
    if (!preview || !rows.length) return;
    void run(async () => {
      const outcome = await rosterApi.confirm({ kind: preview.kind, classroomId: preview.classroom.id, rows: rows.map(toConfirmRow) });
      // A retry reports only the lines it was sent; earlier successes stay in the list.
      setResult((previous) => {
        const merged = new Map((previous?.rows ?? []).map((row) => [row.line, row]));
        outcome.rows.forEach((row) => merged.set(row.line, row));
        const list = [...merged.values()].sort((a, b) => a.line - b.line);
        const counts = { ...outcome.counts };
        (Object.keys(counts) as ConfirmStatus[]).forEach((status) => { counts[status] = list.filter((row) => row.status === status).length; });
        return { rows: list, counts };
      });
      onApplied();
    });
  }

  const failedLines = new Set(result?.rows.filter((row) => row.status === "failed").map((row) => row.line));
  const retryable = actionable.filter((row) => failedLines.has(row.line));
  const issuedLinks = result?.rows.flatMap((row) => {
    const person = preview?.rows.find((item) => item.line === row.line);
    return row.accessLink && person ? [{ fullName: person.fullName, email: row.email, accessLink: row.accessLink }] : [];
  }) ?? [];

  return <section className="panel" id="importacao">
    <div className="panel-heading"><div><span className="eyebrow">IMPORTAÇÃO</span><h2>Importar para {classroomName}</h2></div><UploadCloud size={22} /></div>
    <p className="panel-description">Nada é gravado na prévia. Contas, links de cadastro e matrículas só são criados depois da confirmação.</p>
    <form className={styles.form} onSubmit={submitPreview}>
      <label className={styles.field}>Tipo
        <select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); setPreview(null); setResult(null); }}>
          <option value="students">Alunos</option><option value="teachers">Professores</option>
        </select>
      </label>
      <label className={styles.field}>Arquivo .csv ou .xlsx (até 2 MB)
        <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <button type="submit" className="button button-primary" disabled={!file || busy}>Gerar prévia</button>
    </form>
    <div className={styles.actions}>
      <a className={styles.link} href={`/api/roster/templates/${TEMPLATES[kind].fileName}`}><Download size={13} /> Baixar modelo CSV</a>
    </div>
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {preview && <>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Linha</th><th>Nome</th><th>Email</th>{preview.kind === "teachers" && <th>Matéria</th>}<th>Situação</th><th>Decisão</th></tr></thead>
        <tbody>{preview.rows.map((row) => <tr key={row.line}>
          <td>{row.line}</td><td>{row.fullName || "—"}{row.existingName && row.existingName !== row.fullName && <small> (cadastro: {row.existingName})</small>}</td><td>{row.email || "—"}</td>
          {preview.kind === "teachers" && <td>{row.subject || "—"}</td>}
          <td><span className={badge(row.status)}>{STATUS_LABELS[row.status]}</span>{row.issues.map((issue) => <div key={issue.code}>{issue.message}</div>)}{row.currentEnrollment && row.status === "transfer_available" && <div>Turma atual: {row.currentEnrollment.classroomName}</div>}</td>
          <td>{row.status === "transfer_available" ? <select aria-label={`Decisão da linha ${row.line}`} value={decisions[row.line] ?? ""} onChange={(event) => setDecisions((current) => ({ ...current, [row.line]: event.target.value as Decision }))}>
            <option value="" disabled>Escolher…</option><option value="transfer">Transferir</option><option value="keep">Manter na turma atual</option>
          </select> : "—"}</td>
        </tr>)}</tbody>
      </table></div>
      {undecided > 0 && <p className={styles.notice}>Escolha transferir ou manter em {undecided} linha(s) antes de confirmar.</p>}
      {preview.counts.invalid > 0 && <p className={styles.hint}>Linhas com erro ficam de fora. Corrija o arquivo e gere nova prévia para incluí-las.</p>}
      <div className={styles.actions}>
        <button type="button" className="button button-primary" disabled={busy || undecided > 0 || !actionable.length || Boolean(result)} onClick={() => confirm(actionable)}>Confirmar {actionable.length} linha(s)</button>
        {retryable.length > 0 && <button type="button" className="button button-outline" disabled={busy} onClick={() => confirm(retryable)}>Repetir {retryable.length} falha(s)</button>}
      </div>
    </>}
    {issuedLinks.length > 0 && <>
      <p className={styles.notice}>{ACCESS_LINK_WARNING}</p>
      <div className={styles.actions}><button type="button" className="button button-outline" onClick={() => downloadAccessLinks(issuedLinks, classroomName)}><Download size={14} /> Baixar {issuedLinks.length} link(s) em CSV</button></div>
    </>}
    {result && <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Linha</th><th>Email</th><th>Resultado</th><th>Link de cadastro</th></tr></thead>
      <tbody>{result.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.email}</td><td><span className={badge(row.status)}>{RESULT_LABELS[row.status]}</span>{row.issue && <div>{row.issue.message}</div>}</td><td>{row.accessLink ? <CopyLinkButton link={row.accessLink} /> : "—"}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}
