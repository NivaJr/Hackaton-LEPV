"use client";

import { useEffect, useState } from "react";
import { Award, Check, Flag, Flame, HeartPulse, MessageSquareText, TrendingUp } from "lucide-react";
import { SUBJECTS } from "@/config/catalog";
import type { RecognitionView } from "@/features/recognition/model";
import { recognitionApi, RecognitionApiError } from "@/features/recognition/ui/api";
import type { ChildRecord, FamilyRecord, FamilyRecordCategory, FeedbackResult, StudentOverview } from "../model";
import styles from "./family.module.css";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/family/${path}`, init);
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

const describeError = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";
const subjectName = (id: string) => SUBJECTS.find((subject) => subject.id === id)?.name ?? id;

function RecordEditor({ studentId, category, title, initial }: { studentId: string; category: FamilyRecordCategory; title: string; initial: FamilyRecord }) {
  const [details, setDetails] = useState(initial.details);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setState(null);
    try {
      const record = await call<FamilyRecord>(`students/${studentId}/${category}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details }),
      });
      setSaved(record);
      setDetails(record.details);
      setState({ tone: "success", text: "Salvo." });
    } catch (cause) {
      setState({ tone: "error", text: describeError(cause) });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <div className="panel-heading"><div><span className="eyebrow">SOMENTE RESPONSÁVEL EDITA</span><h2>{title}</h2></div><HeartPulse size={21} /></div>
    <textarea className={styles.textarea} aria-label={title} maxLength={10_000} value={details} onChange={(event) => setDetails(event.target.value)} />
    <div className={styles.actions}>
      <button type="button" className="button button-primary" disabled={busy || details === saved.details} onClick={() => void save()}>Salvar</button>
      {saved.updatedAt && <span className={styles.meta}>Atualizado em {new Date(saved.updatedAt).toLocaleDateString("pt-BR")}</span>}
    </div>
    {state && <p role={state.tone === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[state.tone]}`} style={{ marginTop: 12 }}>{state.text}</p>}
  </section>;
}

const praiseDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

type PraiseState =
  | { kind: "loading" }
  | { kind: "ready"; items: RecognitionView[]; total: number | null }
  | { kind: "off" }
  | { kind: "error"; text: string };

function PraisePanel({ studentId }: { studentId: string }) {
  const [state, setState] = useState<PraiseState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    recognitionApi.forStudent(studentId)
      .then((data) => { if (active) setState({ kind: "ready", items: data.recognitions, total: data.annualPoints?.points ?? null }); })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof RecognitionApiError && cause.status === 503) setState({ kind: "off" });
        else setState({ kind: "error", text: describeError(cause) });
      });
    return () => { active = false; };
  }, [studentId]);

  return <section className="panel" id="elogios">
    <div className="panel-heading"><div><span className="eyebrow">ATITUDES EM AULA</span><h2>Elogios dos professores</h2></div><Award size={21} /></div>
    {state.kind === "loading" && <p className={styles.empty}>Carregando…</p>}
    {state.kind === "off" && <p className={styles.empty}>Os elogios aparecem aqui quando a escola ativar esse recurso.</p>}
    {state.kind === "error" && <p role="alert" className={`${styles.notice} ${styles.error}`}>{state.text}</p>}
    {state.kind === "ready" && state.items.length === 0 && <p className={styles.empty}>Nenhum elogio registrado ainda.</p>}
    {state.kind === "ready" && state.items.length > 0 && <>
      {state.total !== null && <p className={styles.meta}>{state.total} pontos de patente com elogios neste ano letivo.</p>}
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Data</th><th>Professor</th><th>Matéria</th><th>Motivo</th><th>Pontos</th></tr></thead>
        <tbody>{state.items.map((item) => <tr key={item.id}>
          <td>{praiseDate.format(new Date(item.createdAt))}</td>
          <td>{item.teacherName}</td>
          <td>{subjectName(item.subjectId)}</td>
          <td>{item.reasonLabel}{item.note ? `: ${item.note}` : ""}</td>
          <td>+{item.points} pontos de patente</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}

function ChildPanel({ studentId }: { studentId: string }) {
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([call<StudentOverview>(`students/${studentId}`), call<FeedbackResult>(`students/${studentId}/feedback`)])
      .then(([loaded, text]) => { if (active) { setOverview(loaded); setFeedback(text); } })
      .catch((cause: unknown) => { if (active) setError(describeError(cause)); });
    return () => { active = false; };
  }, [studentId]);

  if (error) return <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>;
  if (!overview) return <p className={styles.empty}>Carregando…</p>;
  const { summary, source } = overview.metrics;
  const answers = summary ? summary.correctAnswers + summary.incorrectAnswers : 0;
  const isFixture = source === "fixture";
  const note = isFixture ? "Dado de exemplo" : "Neste período";

  return <>
    {isFixture && <p className={styles.notice}><Flag size={13} /> Frequência e resultados abaixo são dados de exemplo, não medidos. Saúde, apoio e histórico são os registros reais da escola.</p>}
    {!summary && <p id="resultados" className={styles.notice}>Os resultados ainda não estão disponíveis. Saúde, apoio e histórico seguem abaixo.</p>}
    {summary && <div className="stats-grid" id="resultados">
      <div className="stat-card"><span className="stat-icon tone-amber"><Flame size={21} /></span><div><span className="stat-label">Dias com atividades</span><strong className="stat-value">{summary.activityDays}</strong><span className="stat-note">{note}</span></div></div>
      <div className="stat-card"><span className="stat-icon tone-teal"><Check size={21} /></span><div><span className="stat-label">Respostas corretas</span><strong className="stat-value">{summary.correctAnswers} de {answers}</strong><span className="stat-note">{note}</span></div></div>
      <div className="stat-card"><span className="stat-icon tone-violet"><TrendingUp size={21} /></span><div><span className="stat-label">Dias de acesso</span><strong className="stat-value">{summary.accessDays}</strong><span className="stat-note">{note}</span></div></div>
    </div>}
    {feedback && <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PARA CONVERSAR EM CASA</span><h2>Resumo do período</h2></div><MessageSquareText size={21} /></div>
      <p className={styles.feedback}>{feedback.text}</p>
      <span className={styles.meta}>{feedback.origin === "ia" ? "Gerado por IA a partir dos resultados, sem dados de saúde ou apoio." : "Mensagem automática, sem IA."}{feedback.metricsSource === "fixture" ? " Baseada em dados de exemplo." : ""}</span>
    </section>}
    <div className={styles.columns} id="saude-apoio">
      <RecordEditor studentId={studentId} category="health" title="Saúde" initial={overview.health} />
      <RecordEditor studentId={studentId} category="support" title="Necessidades de apoio" initial={overview.support} />
    </div>
    <section className="panel" id="historico">
      <div className="panel-heading"><div><span className="eyebrow">SOMENTE CONSULTA</span><h2>Histórico escolar</h2></div></div>
      {overview.history.length === 0 ? <p className={styles.empty}>Nenhum registro no histórico.</p> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Ano</th><th>Período</th><th>Matéria</th><th>Nota</th><th>Observações</th></tr></thead>
        <tbody>{overview.history.map((entry) => <tr key={entry.id}><td>{entry.schoolYear}</td><td>{entry.period}</td><td>{subjectName(entry.subjectId)}</td><td>{entry.grade ?? "—"}</td><td>{entry.notes || "—"}</td></tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}

export function FamilyWorkspace({ fullName }: { fullName: string }) {
  const [children, setChildren] = useState<ChildRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ children: ChildRecord[] }>("children")
      .then((data) => { setChildren(data.children); setSelectedId(data.children[0]?.id ?? null); })
      .catch((cause: unknown) => setError(describeError(cause)));
  }, []);

  const selected = children?.find((child) => child.id === selectedId);
  return <div className={styles.stack}>
    <div className="page-heading"><div><span className="eyebrow">PRESENTE EM CADA DESCOBERTA</span><h1>Olá, {fullName.split(" ")[0]}<span className="greeting-dot">.</span></h1><p>Acompanhe a jornada dos estudantes vinculados à sua conta.</p></div></div>
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {children?.length === 0 && <section className="panel"><p className={styles.empty}>Nenhum estudante com vínculo confirmado. Fale com a coordenação da escola.</p></section>}
    {children && children.length > 0 && <label className={styles.field}>Estudante
      <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{children.map((child) => <option key={child.id} value={child.id}>{child.fullName}{child.classroomName ? ` · ${child.classroomName}` : ""}</option>)}</select>
    </label>}
    {selected && <ChildPanel key={selected.id} studentId={selected.id} />}
    {selected && <PraisePanel key={`elogios-${selected.id}`} studentId={selected.id} />}
  </div>;
}
