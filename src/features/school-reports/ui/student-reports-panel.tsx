"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText } from "lucide-react";
import styles from "@/features/roster/ui/roster.module.css";
import { MAX_REPORT_LABEL, type SchoolReportFile } from "../model";
import { reportFileUrl, schoolReportsApi } from "./api";

const describeError = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";

export function StudentReportsPanel({ students }: { students: { id: string; fullName: string }[] }) {
  const [studentId, setStudentId] = useState("");
  const [reports, setReports] = useState<SchoolReportFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async (id: string) => {
    setReports(null);
    try { setReports((await schoolReportsApi.list(id)).reports); }
    catch (cause) { setMessage({ tone: "error", text: describeError(cause) }); }
  }, []);

  useEffect(() => {
    if (studentId) void load(studentId);
  }, [studentId, load]);

  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage({ tone: "success", text: success });
      await load(studentId);
    } catch (cause) {
      setMessage({ tone: "error", text: describeError(cause) });
    } finally {
      setBusy(false);
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get("file");
    if (!(file instanceof File) || !file.size) return;
    void run(async () => {
      await schoolReportsApi.upload(studentId, String(fields.get("label")), file);
      form.reset();
    }, "Boletim enviado. Os responsáveis confirmados já podem abrir.");
  }

  return <section className="panel" id="boletins">
    <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO ESCOLAR</span><h2>Boletins em PDF</h2></div><FileText size={21} /></div>
    <p className="panel-description">Boletim emitido pela escola, por aluno. Fica disponível para os responsáveis com vínculo confirmado.</p>
    {students.length === 0 ? <p className={styles.empty}>Matricule alunos nesta turma para enviar boletins.</p> : <>
      <label className={styles.field}>Aluno<select value={studentId} onChange={(event) => { setMessage(null); setStudentId(event.target.value); }}>
        <option value="" disabled>Selecionar…</option>
        {students.map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}
      </select></label>
      {studentId && <>
        {!reports && !message && <p className={styles.empty}>Carregando…</p>}
        {reports?.length === 0 && <p className={styles.empty}>Nenhum boletim enviado para este aluno.</p>}
        {reports?.map((report) => <div className={styles.row} key={report.id}>
          <span>{report.label}<small>{new Date(report.uploadedAt).toLocaleDateString("pt-BR")}</small></span>
          <span>
            <a className={styles.link} href={reportFileUrl(studentId, report.id)} target="_blank" rel="noreferrer">Abrir</a>
            <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy} onClick={() => { if (window.confirm(`Remover "${report.label}"?`)) void run(() => schoolReportsApi.remove(studentId, report.id), "Boletim removido."); }}>Remover</button>
          </span>
        </div>)}
        <form className={styles.form} onSubmit={upload}>
          <label className={styles.field}>Título<input name="label" required maxLength={MAX_REPORT_LABEL} placeholder="Boletim 2026 - 1º bimestre" /></label>
          <label className={styles.field}>Arquivo PDF (até 4 MB)<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
          <button type="submit" className="button button-outline" disabled={busy}>Enviar boletim</button>
        </form>
      </>}
    </>}
    {message && <p role={message.tone === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[message.tone]}`}>{message.text}</p>}
  </section>;
}
