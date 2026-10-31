"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { SUBJECTS } from "@/config/catalog";
import type { SubjectId } from "@/contracts";
import { rosterApi } from "@/features/roster/ui/api";
import type { ClassroomRecord } from "@/features/roster/model";
import styles from "./activation.module.css";

interface PublishedActivity {
  rootQuestionId: string;
  statement: string;
  skillCodes: string[];
  difficulty: "facil" | "media" | "dificil";
  active: boolean;
  activatedAt: string | null;
}

const REQUIRED = 10;
const difficultyLabel = { facil: "Fácil", media: "Média", dificil: "Difícil" } as const;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/learning/${path}`, init);
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

const preview = (text: string) => text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text;

export function ActivationPanel() {
  const baseId = useId();
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState<SubjectId>(SUBJECTS[0].id);
  const [activities, setActivities] = useState<PublishedActivity[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    rosterApi.overview()
      .then((data) => { setClassrooms(data.classrooms); setClassId((current) => current || data.classrooms[0]?.id || ""); })
      .catch((cause) => setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível carregar as turmas." }));
  }, []);

  const load = useCallback(async () => {
    if (!classId) { setActivities(null); return; }
    setActivities(null);
    setSelected([]);
    try {
      const data = await call<{ activities: PublishedActivity[] }>(`catalog?classId=${encodeURIComponent(classId)}&subjectId=${subjectId}`);
      setActivities(data.activities);
    } catch (cause) {
      setActivities([]);
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível carregar as questões." });
    }
  }, [classId, subjectId]);
  useEffect(() => { void load(); }, [load]);

  const activeOnes = activities?.filter((item) => item.active) ?? [];
  const alreadyActivated = activeOnes.length > 0;
  const shown = alreadyActivated ? activeOnes : activities ?? [];

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function activate() {
    if (selected.length !== REQUIRED) return;
    setBusy(true);
    setMessage(null);
    try {
      await call("activation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, subjectId, rootQuestionIds: selected }),
      });
      setMessage({ tone: "success", text: "Pronto. As 10 questões já aparecem para os alunos da turma." });
      await load();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível ativar as questões." });
    } finally {
      setBusy(false);
    }
  }

  return <section className={`panel ${styles.section}`} id="ativacao" aria-labelledby={`${baseId}-title`}>
    <div className="panel-heading"><div><span className="eyebrow">ATIVIDADES</span><h2 id={`${baseId}-title`}>Ativar questões da turma</h2></div></div>
    <p className="panel-description">Escolha a turma e a matéria. Marque 10 questões publicadas pelos professores para liberar aos alunos.</p>
    <div className={styles.form}>
      <label className={styles.field}>Turma
        <select value={classId} onChange={(event) => { setMessage(null); setClassId(event.target.value); }} disabled={!classrooms.length}>
          {!classrooms.length && <option value="">Nenhuma turma cadastrada</option>}
          {classrooms.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.grade}º ano)</option>)}
        </select>
      </label>
      <label className={styles.field}>Matéria
        <select value={subjectId} onChange={(event) => { setMessage(null); setSubjectId(event.target.value as SubjectId); }}>
          {SUBJECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </div>

    {message && <p role={message.tone === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[message.tone]}`}>{message.text}</p>}

    {classId && activities === null && <p className={styles.empty} role="status">Carregando questões…</p>}
    {activities && !activities.length && <p className={styles.empty}>Ainda não há questões publicadas desta matéria para a turma.</p>}

    {alreadyActivated && <p className={styles.notice}>Esta turma já tem {activeOnes.length} questões ativas nesta matéria. Para trocar alguma, use a rotação semanal.</p>}

    {shown.length > 0 && <fieldset className={styles.fieldset}>
      <legend className={styles.visuallyHidden}>
        {alreadyActivated ? "Questões ativas" : "Questões publicadas"}
      </legend>
      <ul className={styles.list}>{shown.map((item) => {
        const inputId = `${baseId}-${item.rootQuestionId}`;
        return <li key={item.rootQuestionId}>
          <label className={styles.item} htmlFor={inputId}>
            <input
              id={inputId} type="checkbox"
              checked={alreadyActivated ? true : selected.includes(item.rootQuestionId)}
              disabled={alreadyActivated || busy}
              onChange={() => toggle(item.rootQuestionId)}
            />
            <span>
              <span className={styles.statement}>{preview(item.statement)}</span>
              <span className={styles.meta}>
                {item.skillCodes.map((code) => <span key={code} className={styles.code}>{code}</span>)}
                <span>{difficultyLabel[item.difficulty]}</span>
                {item.active && <span className={styles.active}>Ativa</span>}
              </span>
            </span>
          </label>
        </li>;
      })}</ul>
    </fieldset>}

    {!alreadyActivated && activities && activities.length > 0 && <div className={styles.actions}>
      <button type="button" className="button button-primary" disabled={busy || selected.length !== REQUIRED} onClick={() => void activate()}>
        {busy ? "Ativando…" : "Ativar 10 questões"}
      </button>
      <span className={styles.count} aria-live="polite">{selected.length} de {REQUIRED} selecionadas</span>
      {activities.length < REQUIRED && <span className={styles.count}>Faltam questões publicadas: há {activities.length}, são necessárias {REQUIRED}.</span>}
    </div>}
  </section>;
}
