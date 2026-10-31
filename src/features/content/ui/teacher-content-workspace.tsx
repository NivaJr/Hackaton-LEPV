"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers3,
  LockKeyhole,
  Plus,
  UploadCloud,
  Users,
} from "lucide-react";
import { SUBJECTS, type SubjectId } from "@/config/catalog";
import type { DashboardMode } from "@/components/app-shell";
import styles from "./teacher-content-workspace.module.css";

export interface TeacherAssignmentOption {
  classId: string;
  className: string;
  subjectId: SubjectId;
}

interface PreparedList {
  id: string;
  subjectName: string;
  contentTitle: string;
  className: string;
  fileName: string;
  answerKey: string;
}

const DEMO_CONTENTS: Partial<Record<SubjectId, string[]>> = {
  matematica: ["Operações com números", "Frações"],
  portugues: ["Verbos", "Interpretação de texto"],
};

function uniqueAssignments(assignments: TeacherAssignmentOption[]) {
  return assignments.filter((assignment, index) => assignments.findIndex((candidate) => (
    candidate.classId === assignment.classId && candidate.subjectId === assignment.subjectId
  )) === index);
}

export function TeacherContentWorkspace({
  fullName,
  mode,
  assignments,
}: {
  fullName: string;
  mode: DashboardMode;
  assignments: TeacherAssignmentOption[];
}) {
  const safeAssignments = useMemo(() => uniqueAssignments(assignments), [assignments]);
  const availableSubjects = useMemo(() => SUBJECTS.filter((subject) => (
    safeAssignments.some((assignment) => assignment.subjectId === subject.id)
  )), [safeAssignments]);
  const [subjectId, setSubjectId] = useState<SubjectId | "">(availableSubjects[0]?.id ?? "");
  const [contentTitle, setContentTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [preparedLists, setPreparedLists] = useState<PreparedList[]>([]);

  const selectedSubject = SUBJECTS.find((subject) => subject.id === subjectId);
  const subjectAssignments = safeAssignments.filter((assignment) => assignment.subjectId === subjectId);
  const suggestedContents = subjectId ? DEMO_CONTENTS[subjectId] ?? [] : [];
  const ready = Boolean(subjectId && contentTitle.trim() && classId && file && answerKey.trim());

  function selectSubject(nextSubjectId: SubjectId) {
    setSubjectId(nextSubjectId);
    setContentTitle("");
    setClassId("");
    setFile(null);
    setFileError("");
    setAnswerKey("");
  }

  function selectFile(nextFile: File | null) {
    if (nextFile && nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setFileError("O arquivo precisa ter no máximo 10 MB.");
      return;
    }
    setFile(nextFile);
    setFileError("");
  }

  function prepareList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assignment = subjectAssignments.find((item) => item.classId === classId);
    if (!ready || !file || !selectedSubject || !assignment) return;
    setPreparedLists((current) => [{
      id: `${Date.now()}-${file.name}`,
      subjectName: selectedSubject.name,
      contentTitle: contentTitle.trim(),
      className: assignment.className,
      fileName: file.name,
      answerKey: answerKey.trim(),
    }, ...current]);
    setFile(null);
    setAnswerKey("");
  }

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">CONTEÚDO E LISTAS DE EXERCÍCIOS</span>
        <h1>Olá, {fullName.split(" ")[0]}<span className="greeting-dot">.</span></h1>
        <p>Escolha a disciplina, o conteúdo e a turma antes de preparar a lista para os alunos.</p>
      </div>
      <span className="class-badge">{mode === "real" ? <LockKeyhole size={15} /> : <GraduationCap size={15} />}{mode === "real" ? "Vínculos autenticados" : "Demonstração local"}</span>
    </div>

    <section className={styles.pathPanel} aria-labelledby="teacher-content-title">
      <div className={styles.pathHeading}>
        <span className={styles.pathIcon}><BookOpen size={24} /></span>
        <div>
          <span className="eyebrow">MESMO CAMINHO DO ALUNO</span>
          <h2 id="teacher-content-title">Disciplina <ChevronRight size={19} /> conteúdo <ChevronRight size={19} /> exercícios</h2>
          <p>O aluno encontrará a lista dentro do mesmo conteúdo escolhido aqui pelo professor.</p>
        </div>
      </div>
    </section>

    {availableSubjects.length === 0 ? <section className="panel">
      <div className={styles.emptyState}><LockKeyhole size={28} /><div><h2>Nenhuma disciplina atribuída</h2><p>O professor precisa receber um vínculo de turma e disciplina antes de preparar listas.</p></div></div>
    </section> : <form className={styles.workspace} onSubmit={prepareList}>
      <section className="panel">
        <div className={styles.stepHeading}><span>1</span><div><h2>Selecione sua disciplina</h2><p>Apenas disciplinas atribuídas a este professor aparecem aqui.</p></div></div>
        <div className={styles.choiceGrid}>
          {availableSubjects.map((subject) => <button type="button" key={subject.id} className={`${styles.choiceCard} ${subjectId === subject.id ? styles.selected : ""}`} onClick={() => selectSubject(subject.id)} aria-pressed={subjectId === subject.id}>
            <BookOpen size={20} /><span><strong>{subject.name}</strong><small>{safeAssignments.filter((item) => item.subjectId === subject.id).length} turma(s)</small></span>{subjectId === subject.id && <Check size={18} />}
          </button>)}
        </div>
      </section>

      <section className="panel">
        <div className={styles.stepHeading}><span>2</span><div><h2>Selecione ou crie o conteúdo</h2><p>Exemplo: dentro de Português, escolha Verbos.</p></div></div>
        {suggestedContents.length > 0 && <div className={styles.contentChoices}>
          {suggestedContents.map((content) => <button type="button" key={content} className={`${styles.contentChip} ${contentTitle === content ? styles.activeChip : ""}`} onClick={() => setContentTitle(content)} aria-pressed={contentTitle === content}><Layers3 size={17} />{content}</button>)}
        </div>}
        <label className={styles.fieldLabel} htmlFor="new-content">Conteúdo da lista</label>
        <div className={styles.inputWithIcon}><Plus size={18} /><input id="new-content" value={contentTitle} onChange={(event) => setContentTitle(event.target.value)} placeholder="Ex.: Verbos" maxLength={120} /></div>
      </section>

      <section className="panel">
        <div className={styles.stepHeading}><span>3</span><div><h2>Escolha a turma</h2><p>A lista ficará associada à disciplina e ao conteúdo desta turma.</p></div></div>
        <div className={styles.choiceGrid}>
          {subjectAssignments.map((assignment) => <button type="button" key={`${assignment.subjectId}-${assignment.classId}`} className={`${styles.choiceCard} ${classId === assignment.classId ? styles.selected : ""}`} onClick={() => setClassId(assignment.classId)} aria-pressed={classId === assignment.classId}>
            <Users size={20} /><span><strong>{assignment.className}</strong><small>{selectedSubject?.name}</small></span>{classId === assignment.classId && <Check size={18} />}
          </button>)}
        </div>
      </section>

      <section className={`panel ${styles.uploadPanel}`}>
        <div className={styles.stepHeading}><span>4</span><div><h2>Envie a lista e o gabarito</h2><p>PDF, Word ou texto. O gabarito é obrigatório e nunca deve ser exibido ao aluno.</p></div></div>
        <label className={styles.dropzone} htmlFor="exercise-file">
          <UploadCloud size={31} />
          <strong>{file ? file.name : "Escolher lista de exercícios"}</strong>
          <span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB selecionados` : "PDF, DOC, DOCX ou TXT · até 10 MB"}</span>
          <input id="exercise-file" type="file" accept=".pdf,.doc,.docx,.txt" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        </label>
        {fileError && <p className={styles.fileError} role="alert">{fileError}</p>}
        <label className={styles.fieldLabel} htmlFor="answer-key">Gabarito original</label>
        <textarea id="answer-key" value={answerKey} onChange={(event) => setAnswerKey(event.target.value)} placeholder="Ex.: 1-A, 2-C, 3-B..." rows={4} maxLength={5000} />
        <div className={styles.actionRow}>
          <div><strong>{selectedSubject?.name ?? "Disciplina"} {contentTitle && `· ${contentTitle}`}</strong><span>{classId ? subjectAssignments.find((item) => item.classId === classId)?.className : "Selecione uma turma"}</span></div>
          <button type="submit" className="button button-primary" disabled={!ready}><FileCheck2 size={17} />Preparar para revisão</button>
        </div>
      </section>
    </form>}

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">ANTES DE PUBLICAR</span><h2>Listas preparadas para revisão</h2></div><span className="subtle-pill">{preparedLists.length} nesta sessão</span></div>
      {preparedLists.length === 0 ? <div className={styles.reviewEmpty}><FileText size={25} /><p>As listas preparadas aparecerão aqui com disciplina, conteúdo, turma e gabarito para conferência.</p></div> : <div className={styles.reviewList}>
        {preparedLists.map((list) => <article key={list.id} className={styles.reviewItem}>
          <span className={styles.fileIcon}><FileCheck2 size={21} /></span>
          <div><strong>{list.contentTitle}</strong><span>{list.subjectName} · {list.className}</span><small>{list.fileName} · gabarito informado ({list.answerKey.length} caracteres)</small></div>
          <span className={styles.pendingBadge}>Não publicada</span>
        </article>)}
      </div>}
      <div className={styles.integrationNotice}><LockKeyhole size={17} /><p>Esta etapa prepara a revisão na interface. A publicação permanente para os alunos depende da futura API protegida de conteúdos, armazenamento e banco; nenhum arquivo desta tela é enviado ao servidor nesta versão.</p></div>
    </section>
  </>;
}
