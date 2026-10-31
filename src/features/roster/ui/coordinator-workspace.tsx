"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Flag, GraduationCap, TrendingUp, Users } from "lucide-react";
import { ActivityManager } from "@/features/learning/ui/activity-manager";
import { GRADES, SUBJECTS, getSubject } from "@/config/catalog";
import type { SubjectId } from "@/contracts";
import { AccessLinkNotice, ClassAccessLinksPanel, type IssuedLink } from "./access-link";
import { rosterApi, type RosterOverview } from "./api";
import { GuardianPanel } from "./guardian-panel";
import { ImportPanel } from "./import-panel";
import { StudentResultsPanel } from "./student-results-panel";
import styles from "./roster.module.css";

export function CoordinatorWorkspace({ fullName, schoolYear }: { fullName: string; schoolYear: number }) {
  const [data, setData] = useState<RosterOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);

  const refresh = useCallback(async () => {
    try { setData(await rosterApi.overview()); }
    catch (cause) { setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível carregar a escola." }); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage({ tone: "success", text: success });
      await refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível concluir a operação." });
    } finally {
      setBusy(false);
    }
  }

  function issueLink({ id, name }: { id: string; name: string }) {
    void act(async () => {
      const { accessLink } = await rosterApi.issueAccessLink(id);
      setIssued({ name, link: accessLink });
    }, "Novo link gerado.");
  }

  function createClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void act(async () => {
      await rosterApi.createClassroom({ name: String(fields.get("name")), grade: Number(fields.get("grade")), schoolYear: Number(fields.get("schoolYear")) });
      form.reset();
    }, "Turma criada.");
  }

  const classrooms = data?.classrooms ?? [];
  const selected = classrooms.find((classroom) => classroom.id === selectedId) ?? null;
  const metricsOf = (id: string) => data?.metrics.classes.find((item) => item.classroomId === id);
  const isFixture = data?.metrics.source === "fixture";
  const nameOf = (id: string) => data?.students.concat(data.teachers).find((person) => person.id === id)?.fullName ?? "Pessoa";
  const roster = data?.enrollments.filter((item) => item.classroomId === selectedId) ?? [];
  const staff = data?.assignments.filter((item) => item.classroomId === selectedId) ?? [];
  // The assigned teacher activates a subject; the coordinator covers only the remaining ones.
  const orphanSubjects = SUBJECTS.filter((subject) => !staff.some((item) => item.subjectId === subject.id));
  const available = data?.students.filter((student) => !roster.some((item) => item.studentId === student.id)) ?? [];

  function editClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const fields = new FormData(event.currentTarget);
    void act(() => rosterApi.updateClassroom(selected.id, { name: String(fields.get("name")), grade: Number(fields.get("grade")), schoolYear: Number(fields.get("schoolYear")) }), "Turma atualizada.");
  }

  function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const studentId = String(new FormData(event.currentTarget).get("studentId"));
    if (!selected || !studentId) return;
    const current = data?.enrollments.find((item) => item.studentId === studentId);
    if (current && !window.confirm(`Transferir de ${current.classroomName} para ${selected.name}?`)) return;
    void act(() => rosterApi.allocate({ classroomId: selected.id, studentId, ...(current ? { expectedEnrollmentId: current.id } : {}) }), current ? "Aluno transferido." : "Aluno matriculado.");
  }

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (!selected) return;
    void act(() => rosterApi.assign({ classroomId: selected.id, teacherId: String(fields.get("teacherId")), subjectId: String(fields.get("subjectId")) as SubjectId }), "Professor atribuído.");
  }

  return <div className={styles.stack}>
    <div className="page-heading"><div><span className="eyebrow">GESTÃO DA ESCOLA</span><h1>Olá, {fullName.split(" ")[0]}<span className="greeting-dot">.</span></h1><p>Turmas, alunos, professores e importações da sua escola.</p></div></div>
    <div className="stats-grid">
      <div className="stat-card"><span className="stat-icon tone-violet"><Users size={21} /></span><div><span className="stat-label">Turmas</span><strong className="stat-value">{classrooms.length}</strong><span className="stat-note">Cadastradas na escola</span></div></div>
      <div className="stat-card"><span className="stat-icon tone-teal"><GraduationCap size={21} /></span><div><span className="stat-label">Alunos</span><strong className="stat-value">{data?.students.length ?? "—"}</strong><span className="stat-note">{data?.enrollments.length ?? 0} com matrícula ativa</span></div></div>
      <div className="stat-card"><span className="stat-icon tone-amber"><TrendingUp size={21} /></span><div><span className="stat-label">Professores</span><strong className="stat-value">{data?.teachers.length ?? "—"}</strong><span className="stat-note">{data?.assignments.length ?? 0} atribuições por matéria</span></div></div>
    </div>
    {message && <p role={message.tone === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[message.tone]}`}>{message.text}</p>}
    <div className={styles.columns}>
      <section className="panel" id="turmas">
        <div className="panel-heading"><div><span className="eyebrow">TURMAS</span><h2>Turmas da escola</h2></div></div>
        {isFixture && <p className={styles.notice}><Flag size={13} /> Frequência e acertos abaixo são dados de exemplo, não medidos. Engajamento considera frequência, não cliques.</p>}
        {data && !classrooms.length && <p className={styles.empty}>Nenhuma turma cadastrada ainda.</p>}
        <ul className={styles.list}>{classrooms.map((classroom) => {
          const metrics = metricsOf(classroom.id);
          return <li key={classroom.id}><button type="button" className={styles.classButton} aria-pressed={classroom.id === selectedId} onClick={() => setSelectedId(classroom.id)}>
            <strong>{classroom.name}</strong><small>{classroom.grade}º ano · {classroom.schoolYear}</small>
            {metrics && <span className={styles.metrics}>Frequência {metrics.frequencyPercent}% · Acertos {metrics.correctPercent}%{isFixture ? " · exemplo" : ""}</span>}
          </button></li>;
        })}</ul>
        <form className={styles.form} onSubmit={createClassroom}>
          <label className={styles.field}>Nome<input name="name" required maxLength={100} /></label>
          <label className={styles.field}>Série<select name="grade" defaultValue={GRADES[0]}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}º ano</option>)}</select></label>
          <label className={styles.field}>Ano letivo<input name="schoolYear" type="number" min={2000} max={2200} defaultValue={schoolYear} required /></label>
          <button type="submit" className="button button-primary" disabled={busy}>Criar turma</button>
        </form>
      </section>
      <div className={styles.stack}>
        {issued && <AccessLinkNotice issued={issued} onClose={() => setIssued(null)} />}
        {!selected && <section className="panel"><span id="acompanhamento" /><span id="vinculos" /><span id="importacao" /><p className={styles.empty}>Selecione uma turma para ver alunos, professores, resultados, responsáveis e importações.</p></section>}
        {selected && <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">TURMA</span><h2>{selected.name}</h2></div>
            <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy} onClick={() => { if (window.confirm(`Excluir a turma ${selected.name}?`)) void act(async () => { await rosterApi.deleteClassroom(selected.id); setSelectedId(null); }, "Turma excluída."); }}>Excluir turma</button>
          </div>
          <form key={`${selected.id}-${selected.name}-${selected.grade}-${selected.schoolYear}`} className={styles.form} onSubmit={editClassroom}>
            <label className={styles.field}>Nome<input name="name" required maxLength={100} defaultValue={selected.name} /></label>
            <label className={styles.field}>Série<select name="grade" defaultValue={selected.grade}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}º ano</option>)}</select></label>
            <label className={styles.field}>Ano letivo<input name="schoolYear" type="number" min={2000} max={2200} defaultValue={selected.schoolYear} required /></label>
            <button type="submit" className="button button-outline" disabled={busy}>Salvar turma</button>
          </form>
          <ClassAccessLinksPanel key={`links-${selected.id}`} classroomId={selected.id} classroomName={selected.name} />
          <h3>Alunos ({roster.length})</h3>
          {roster.map((item) => <div className={styles.row} key={item.id}><span>{nameOf(item.studentId)}</span><span><button type="button" className={styles.link} disabled={busy} onClick={() => issueLink({ id: item.studentId, name: nameOf(item.studentId) })}>Novo link</button><button type="button" className={styles.link} disabled={busy} onClick={() => { if (window.confirm("Encerrar esta matrícula?")) void act(() => rosterApi.removeEnrollment(item.id), "Matrícula encerrada."); }}>Remover</button></span></div>)}
          <form className={styles.form} onSubmit={allocate}>
            <label className={styles.field}>Aluno da escola<select name="studentId" defaultValue="" required><option value="" disabled>Selecionar…</option>{available.map((student) => { const current = data?.enrollments.find((item) => item.studentId === student.id); return <option key={student.id} value={student.id}>{student.fullName}{current ? ` (${current.classroomName})` : ""}</option>; })}</select></label>
            <button type="submit" className="button button-outline" disabled={busy}>Matricular</button>
          </form>
          <h3>Professores ({staff.length})</h3>
          {staff.map((item) => <div className={styles.row} key={item.id}><span>{nameOf(item.teacherId)}<small>{getSubject(item.subjectId).name}</small></span><span><button type="button" className={styles.link} disabled={busy} onClick={() => issueLink({ id: item.teacherId, name: nameOf(item.teacherId) })}>Novo link</button><button type="button" className={styles.link} disabled={busy} onClick={() => void act(() => rosterApi.unassign(item.id), "Atribuição removida.")}>Remover</button></span></div>)}
          <form className={styles.form} onSubmit={assign}>
            <label className={styles.field}>Professor<select name="teacherId" defaultValue="" required><option value="" disabled>Selecionar…</option>{data?.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select></label>
            <label className={styles.field}>Matéria<select name="subjectId" defaultValue={SUBJECTS[0].id}>{SUBJECTS.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <button type="submit" className="button button-outline" disabled={busy}>Atribuir</button>
          </form>
        </section>}
        {selected && data && <StudentResultsPanel key={`resultados-${selected.id}`} students={data.students.filter((student) => roster.some((item) => item.studentId === student.id))} />}
        {selected && data && <GuardianPanel key={`vinculos-${selected.id}`} students={data.students.filter((student) => roster.some((item) => item.studentId === student.id))} guardians={data.guardians} links={data.guardianLinks} busy={busy} act={act} onLinkIssued={setIssued} issueLink={issueLink} />}
        {selected && orphanSubjects.length > 0 && <ActivityManager key={`atividades-${selected.id}-${orphanSubjects.length}`} title="Atividades sem professor" scopes={orphanSubjects.map((subject) => ({ classId: selected.id, className: selected.name, subjectId: subject.id }))} />}
        {selected && <ImportPanel key={selected.id} classroomId={selected.id} classroomName={selected.name} onApplied={() => void refresh()} />}
      </div>
    </div>
  </div>;
}
