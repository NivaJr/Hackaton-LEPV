"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Search, UserX } from "lucide-react";
import {
  RECOGNITION_DAILY_LIMIT,
  RECOGNITION_NOTE_MAX,
  RECOGNITION_POINTS,
  RECOGNITION_REASON_LABELS,
  RecognitionReasonSchema,
  type RecognitionOutcome,
  type RecognitionReason,
} from "../model";
import { recognitionApi, RecognitionApiError, type ClassStudent } from "./api";
import styles from "./recognition.module.css";

export interface TeacherAssignmentOption {
  classId: string;
  className: string;
  grade: number;
  subjectId: string;
  subjectName: string;
}

type RosterState =
  | { status: "loading" }
  | { status: "ready"; students: ClassStudent[]; dailyLimit: number }
  | { status: "error"; message: string };

const STORAGE_KEY = "eai.reconhecer.turma";
const REASONS = RecognitionReasonSchema.options;

function optionKey(option: TeacherAssignmentOption) {
  return `${option.classId}:${option.subjectId}`;
}

function readStoredKey() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function storeKey(value: string) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* storage blocked */ }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function studentsLabel(count: number) {
  return count === 1 ? "1 aluno" : `${count} alunos`;
}

export function RecognizePanel({ assignments }: { assignments: TeacherAssignmentOption[] }) {
  const ids = useId();
  const [selectedKey, setSelectedKey] = useState(() => (assignments[0] ? optionKey(assignments[0]) : ""));
  const [roster, setRoster] = useState<RosterState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<RecognitionReason | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [results, setResults] = useState<RecognitionOutcome[] | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const assignment = assignments.find((item) => optionKey(item) === selectedKey) ?? assignments[0];

  useEffect(() => {
    const stored = readStoredKey();
    if (stored && assignments.some((item) => optionKey(item) === stored)) setSelectedKey(stored);
  }, [assignments]);

  const loadRoster = useCallback(async (classId: string) => {
    setRoster({ status: "loading" });
    try {
      const data = await recognitionApi.students(classId);
      setRoster({ status: "ready", students: data.students, dailyLimit: data.dailyLimit });
    } catch (error) {
      setRoster({ status: "error", message: error instanceof RecognitionApiError ? error.message : "Não foi possível carregar a turma." });
    }
  }, []);

  const classId = assignment?.classId;
  const subjectId = assignment?.subjectId;
  useEffect(() => {
    if (!classId) return;
    setSelected(new Set());
    setResults(null);
    idempotencyKey.current = null;
    void loadRoster(classId);
  }, [classId, subjectId, loadRoster]);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const students = useMemo(() => (roster.status === "ready" ? roster.students : []), [roster]);
  const names = useMemo(() => new Map(students.map((student) => [student.studentId, student.name])), [students]);
  const visible = useMemo(() => {
    const term = normalize(query.trim());
    return term ? students.filter((student) => normalize(student.name).includes(term)) : students;
  }, [students, query]);

  const trimmedNote = note.trim();
  const noteRequired = reason === "outro";
  const canSend = selected.size > 0 && reason !== null && (!noteRequired || trimmedNote.length > 0) && !sending;

  function resetIntent() {
    idempotencyKey.current = null;
    setSendError(null);
  }

  function toggle(studentId: string) {
    resetIntent();
    setResults(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectVisible() {
    resetIntent();
    setResults(null);
    setSelected((current) => {
      const next = new Set(current);
      visible.filter((student) => student.remainingToday > 0).forEach((student) => next.add(student.studentId));
      return next;
    });
  }

  async function send() {
    if (!assignment || !reason || !canSend) return;
    const key = idempotencyKey.current ?? newKey();
    idempotencyKey.current = key;
    setSending(true);
    setSendError(null);
    try {
      const response = await recognitionApi.grant({
        classId: assignment.classId, subjectId: assignment.subjectId, studentIds: [...selected], reason,
        note: trimmedNote || undefined, idempotencyKey: key,
      });
      setResults(response.results);
      setConfirming(false);
      setSelected(new Set());
      setReason(null);
      setNote("");
      idempotencyKey.current = null;
      setRoster((current) => current.status !== "ready" ? current : {
        ...current,
        students: current.students.map((student) => {
          const outcome = response.results.find((item) => item.studentId === student.studentId);
          if (outcome?.remainingToday === undefined) return student;
          return { ...student, remainingToday: outcome.remainingToday, awardedToday: current.dailyLimit - outcome.remainingToday };
        }),
      });
    } catch (error) {
      // The same key is kept so a retry after a dropped connection cannot award twice.
      setSendError(error instanceof RecognitionApiError ? error.message : "Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  }

  if (!assignment) {
    return <main className={styles.main}><p className={styles.notice}>Você ainda não tem turmas atribuídas. Peça à coordenação para vincular suas turmas e matérias.</p></main>;
  }

  const reasonLabel = reason ? RECOGNITION_REASON_LABELS[reason] : "";

  return <>
    <main className={styles.main} id="conteudo">
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${ids}-turma`}>Turma e matéria</label>
        <select
          id={`${ids}-turma`} className={styles.select} value={selectedKey}
          onChange={(event) => { setSelectedKey(event.target.value); storeKey(event.target.value); }}
        >
          {assignments.map((item) => <option key={optionKey(item)} value={optionKey(item)}>{item.className} · {item.subjectName}</option>)}
        </select>
      </div>

      {results && <section aria-labelledby={`${ids}-resultado`} className={styles.notice} role="status">
        <h2 id={`${ids}-resultado`} className={styles.label}>Resultado do envio</h2>
        <ul className={styles.results}>
          {results.map((item) => <ResultRow key={item.studentId} outcome={item} name={names.get(item.studentId) ?? "Aluno"} />)}
        </ul>
      </section>}

      <section aria-labelledby={`${ids}-alunos`} className={styles.field}>
        <div className={styles.toolbar}>
          <h2 id={`${ids}-alunos`} className={styles.label}>Quem merece pontos?</h2>
          {roster.status === "ready" && visible.length > 0 && <button type="button" className={styles.textButton} onClick={selectVisible}>
            {query ? "Marcar os encontrados" : "Marcar todos"}
          </button>}
        </div>
        <label className={styles.srOnly} htmlFor={`${ids}-busca`}>Buscar aluno pelo nome</label>
        <div style={{ position: "relative" }}>
          <Search size={18} aria-hidden="true" style={{ position: "absolute", left: 12, top: 15, color: "#4a5674" }} />
          <input
            id={`${ids}-busca`} type="search" className={styles.search} style={{ paddingLeft: 38 }}
            placeholder="Buscar aluno" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"
          />
        </div>
        {roster.status === "loading" && <p className={styles.empty}>Carregando a turma...</p>}
        {roster.status === "error" && <div className={`${styles.notice} ${styles.error}`} role="alert">
          {roster.message}{" "}
          <button type="button" className={styles.textButton} onClick={() => void loadRoster(assignment.classId)}>Tentar de novo</button>
        </div>}
        {roster.status === "ready" && students.length === 0 && <p className={styles.empty}>Nenhum aluno com matrícula ativa nesta turma.</p>}
        {roster.status === "ready" && students.length > 0 && visible.length === 0 && <p className={styles.empty}>Nenhum nome encontrado.</p>}
        {visible.length > 0 && <ul className={styles.grid}>
          {visible.map((student) => {
            const blocked = student.remainingToday === 0;
            const pressed = selected.has(student.studentId);
            return <li key={student.studentId}>
              <button
                type="button" className={styles.studentCard} aria-pressed={pressed} disabled={blocked && !pressed}
                onClick={() => toggle(student.studentId)}
              >
                <span className={styles.avatar} aria-hidden="true">{student.initials || "?"}</span>
                <span className={styles.studentText}>
                  <span className={styles.studentName}>{student.name}</span>
                  <span className={styles.studentMeta}>
                    {blocked ? "Limite de hoje atingido" : student.awardedToday === 0 ? "Nenhum hoje" : `${student.awardedToday} de ${roster.status === "ready" ? roster.dailyLimit : RECOGNITION_DAILY_LIMIT} hoje`}
                  </span>
                </span>
              </button>
            </li>;
          })}
        </ul>}
      </section>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Motivo</legend>
        <div className={styles.chips}>
          {REASONS.map((value) => <span key={value}>
            <input
              id={`${ids}-${value}`} className={styles.chipInput} type="radio" name={`${ids}-motivo`} value={value}
              checked={reason === value} onChange={() => { resetIntent(); setReason(value); }}
            />
            <label htmlFor={`${ids}-${value}`} className={styles.chip}>{RECOGNITION_REASON_LABELS[value]}</label>
          </span>)}
        </div>
      </fieldset>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${ids}-nota`}>{noteRequired ? "Conte o motivo" : "Recado para o aluno (opcional)"}</label>
        <textarea
          id={`${ids}-nota`} className={styles.note} maxLength={RECOGNITION_NOTE_MAX} value={note}
          required={noteRequired} aria-describedby={`${ids}-nota-conta`}
          onChange={(event) => { resetIntent(); setNote(event.target.value); }}
        />
        <span id={`${ids}-nota-conta`} className={styles.hint}>{note.length} de {RECOGNITION_NOTE_MAX} caracteres. O aluno e o responsável leem este texto.</span>
      </div>
    </main>

    <div className={styles.bar}>
      <div className={styles.barInner}>
        <span className={styles.barSummary} aria-live="polite">
          {selected.size === 0 ? "Escolha alunos e um motivo" : `${studentsLabel(selected.size)}${reason ? ` · ${reasonLabel}` : " · falta o motivo"}`}
        </span>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!canSend} onClick={() => setConfirming(true)}>
          Dar {RECOGNITION_POINTS} pontos
        </button>
      </div>
    </div>

    {confirming && <div className={styles.sheetBackdrop} onClick={() => !sending && setConfirming(false)}>
      <div
        className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={`${ids}-confirmar`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === "Escape" && !sending) setConfirming(false); }}
      >
        <h2 id={`${ids}-confirmar`} className={styles.sheetTitle}>
          Dar {RECOGNITION_POINTS} pontos para {studentsLabel(selected.size)}?
        </h2>
        <p className={styles.hint}>
          Motivo: {reasonLabel}{trimmedNote ? `. "${trimmedNote}"` : ""}. Os pontos contam para a patente do ano e não entram no ranking semanal.
        </p>
        {sendError && <p className={`${styles.notice} ${styles.error}`} role="alert">{sendError}</p>}
        <div className={styles.sheetActions}>
          <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={sending} onClick={() => setConfirming(false)}>Voltar</button>
          <button ref={confirmButton} type="button" className={`${styles.button} ${styles.primary}`} disabled={sending} onClick={() => void send()}>
            {sending ? "Enviando..." : sendError ? "Tentar de novo" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>}
  </>;
}

function ResultRow({ outcome, name }: { outcome: RecognitionOutcome; name: string }) {
  if (outcome.status === "concedido") {
    return <li className={`${styles.result} ${styles.resultOk}`}>
      <CheckCircle2 size={20} aria-hidden="true" />
      <span>{name}: +{outcome.points} pontos{outcome.repeated ? " (já registrado antes)" : ""}</span>
    </li>;
  }
  if (outcome.status === "limite_diario") {
    return <li className={`${styles.result} ${styles.resultLimit}`}>
      <Clock3 size={20} aria-hidden="true" />
      <span>{name}: já recebeu {RECOGNITION_DAILY_LIMIT} elogios seus hoje. Amanhã libera de novo.</span>
    </li>;
  }
  return <li className={`${styles.result} ${styles.resultMissing}`}>
    <UserX size={20} aria-hidden="true" />
    <span>{name}: não está matriculado nesta turma.</span>
  </li>;
}
