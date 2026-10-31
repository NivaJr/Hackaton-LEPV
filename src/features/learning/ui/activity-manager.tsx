"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { getSubject } from "@/config/catalog";
import type { SubjectId } from "@/contracts";
import type { ActivityCatalogView } from "../server/model";
import styles from "./activity-manager.module.css";

export interface ActivityScope { classId: string; className: string; subjectId: SubjectId; }

const REQUIRED_ACTIVE = 10;
const WEEKLY_SWAP = 2;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/learning/${path}`, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

const post = (path: string, body: unknown) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const describeError = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";

/** Activation needs the whole set at once, and each week swaps exactly two questions. */
export function selectionGoal(view: Pick<ActivityCatalogView, "activities">) {
  return view.activities.some((item) => item.active && item.activityType === "weekly_challenge") ? WEEKLY_SWAP : REQUIRED_ACTIVE;
}

export function ActivityManager({ scopes, title = "Atividades da turma" }: { scopes: ActivityScope[]; title?: string }) {
  const [index, setIndex] = useState(0);
  const scope = scopes[Math.min(index, scopes.length - 1)];
  const [view, setView] = useState<ActivityCatalogView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!scope) return;
    setView(null);
    setSelected([]);
    setView(await call<ActivityCatalogView>(`catalog?classId=${scope.classId}&subjectId=${scope.subjectId}`));
  }, [scope]);

  useEffect(() => {
    setMessage(null);
    load().catch((cause: unknown) => setMessage({ tone: "error", text: describeError(cause) }));
  }, [load]);

  if (!scope) return <section className="panel" id="atividades"><h2>{title}</h2><p className={styles.empty}>Nenhuma turma disponível.</p></section>;

  const active = view?.activities.filter((item) => item.activityType === "weekly_challenge" && item.active) ?? [];
  const available = view?.activities.filter((item) => item.activityType === "weekly_challenge" && !item.active && !item.retired) ?? [];
  const regularCount = view?.activities.filter((item) => item.activityType === "exercise" && item.active).length ?? 0;
  const goal = view ? selectionGoal(view) : REQUIRED_ACTIVE;
  const initial = active.length === 0;
  const blockedByWeek = !initial && Boolean(view?.rotatedThisWeek);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < goal ? [...current, id] : current);
  }

  async function submit() {
    if (!view) return;
    setBusy(true);
    setMessage(null);
    try {
      const target = { classId: scope.classId, subjectId: scope.subjectId };
      await (initial
        ? post("activation", { ...target, rootQuestionIds: selected })
        : post("rotation", { ...target, weekStart: view.weekStart, incomingRootIds: selected }));
      await load();
      setMessage({ tone: "success", text: initial ? "Atividades liberadas para os alunos." : "Rotação da semana concluída." });
    } catch (cause) {
      setMessage({ tone: "error", text: describeError(cause) });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" id="atividades">
    <div className="panel-heading"><div><span className="eyebrow">LIBERAÇÃO PARA OS ALUNOS</span><h2>{title}</h2></div><CalendarClock size={21} /></div>
    <p className="panel-description">Cada disciplina tem {REQUIRED_ACTIVE} desafios ativos. Na rotação semanal entram {WEEKLY_SWAP} e saem os {WEEKLY_SWAP} mais antigos da disciplina. As listas de exercícios ficam disponíveis assim que são publicadas.</p>
    {scopes.length > 1 && <label className={styles.field}>Turma e matéria
      <select value={Math.min(index, scopes.length - 1)} onChange={(event) => setIndex(Number(event.target.value))}>
        {scopes.map((item, position) => <option key={`${item.classId}-${item.subjectId}`} value={position}>{item.className} · {getSubject(item.subjectId).name}</option>)}
      </select>
    </label>}
    {message && <p role={message.tone === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[message.tone]}`}>{message.text}</p>}
    {!view && !message && <p className={styles.empty}>Carregando…</p>}
    {view && <>
      <p className={styles.count}><strong>{active.length}</strong> desafios ativos · <strong>{available.length}</strong> aguardando seleção · <strong>{regularCount}</strong> exercícios disponíveis</p>
      {active.length > 0 && <>
        <h3>Ativas agora</h3>
        <ul className={styles.list}>{active.map((item) => <li key={item.rootQuestionId}>
          <span className={styles.statement}>{item.statement}</span>
          {view.outgoingNext.includes(item.rootQuestionId) && !view.rotatedThisWeek && <span className={styles.leaving}>sai na próxima rotação</span>}
        </li>)}</ul>
      </>}
      {blockedByWeek && <p className={styles.notice}>A rotação desta semana já foi feita. A próxima fica disponível na segunda-feira.</p>}
      {!blockedByWeek && <>
        <h3>{initial ? `Escolha ${REQUIRED_ACTIVE} questões` : `Escolha ${WEEKLY_SWAP} questões para entrar`}</h3>
        {available.length < goal && <p className={styles.notice}>Faltam {goal - available.length} questão(ões) publicada(s) para continuar.</p>}
        <ul className={styles.list}>{available.map((item) => <li key={item.rootQuestionId}>
          <label className={styles.option}>
            <input type="checkbox" checked={selected.includes(item.rootQuestionId)} disabled={busy || (!selected.includes(item.rootQuestionId) && selected.length >= goal)} onChange={() => toggle(item.rootQuestionId)} />
            <span className={styles.statement}>{item.statement}</span>
          </label>
        </li>)}</ul>
        <div className={styles.actions}>
          <button type="button" className="button button-primary" disabled={busy || selected.length !== goal} onClick={() => void submit()}><RefreshCw size={14} /> {initial ? "Liberar para os alunos" : "Fazer rotação"} ({selected.length}/{goal})</button>
        </div>
      </>}
    </>}
  </section>;
}
