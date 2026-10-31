"use client";

import { useEffect, useState } from "react";
import type { PersonRecord, StudentResults } from "../model";
import { rosterApi } from "./api";
import styles from "./roster.module.css";

const formatDate = (date: string) => date.split("-").reverse().join("/");

export function StudentResultsPanel({ students }: { students: PersonRecord[] }) {
  const [studentId, setStudentId] = useState("");
  const [loaded, setLoaded] = useState<{ studentId: string; results: StudentResults } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    setError(null);
    rosterApi.studentResults(studentId)
      .then((results) => { if (active) setLoaded({ studentId, results }); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os resultados."); });
    return () => { active = false; };
  }, [studentId]);

  const results = loaded?.studentId === studentId ? loaded.results : null;
  const summary = results?.summary;

  return <section className="panel" id="acompanhamento">
    <div className="panel-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Resultados por aluno</h2></div></div>
    <p className="panel-description">Últimos 30 dias, com os dados registrados pelos alunos. Engajamento considera frequência, não cliques.</p>
    {students.length === 0 && <p className={styles.empty}>Nenhum aluno nesta turma.</p>}
    {students.length > 0 && <label className={styles.field}>Aluno
      <select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="" disabled>Selecionar…</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}</select>
    </label>}
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {studentId && !error && !results && <p className={styles.empty}>Carregando…</p>}
    {results && !summary && <p className={styles.notice}>Os resultados deste aluno ainda não estão disponíveis.</p>}
    {summary && <>
      <dl className={styles.results}>
        <div><dt>Dias de acesso</dt><dd>{summary.accessDays}</dd></div>
        <div><dt>Dias com atividades</dt><dd>{summary.activityDays}</dd></div>
        <div><dt>Respostas corretas</dt><dd>{summary.correctAnswers} de {summary.correctAnswers + summary.incorrectAnswers}</dd></div>
        <div><dt>XP ativo</dt><dd>{summary.xp}</dd></div>
        <div><dt>Pontos anuais</dt><dd>{summary.rankPoints}</dd></div>
        <div><dt>Patente</dt><dd>{summary.rankName}</dd></div>
      </dl>
      <p className={styles.hint}>Período: {formatDate(summary.periodStart)} a {formatDate(summary.periodEnd)}.{summary.difficultSkillCodes.length > 0 ? ` Habilidades com erros: ${summary.difficultSkillCodes.join(", ")}.` : " Nenhuma habilidade com erro no período."}</p>
    </>}
  </section>;
}
