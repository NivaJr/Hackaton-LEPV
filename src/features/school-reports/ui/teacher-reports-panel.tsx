"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import styles from "@/features/roster/ui/roster.module.css";
import { schoolReportsApi } from "./api";
import { FamilyReportsList } from "./family-reports-list";

export function TeacherReportsPanel({ classes }: { classes: { classId: string; className: string }[] }) {
  const [classId, setClassId] = useState(classes[0]?.classId ?? "");
  const [students, setStudents] = useState<{ id: string; fullName: string }[] | null>(null);
  const [studentId, setStudentId] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    schoolReportsApi.classStudents(classId)
      .then((data) => { if (active) setStudents(data.students); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [classId]);

  function selectClass(value: string) {
    setStudents(null);
    setStudentId("");
    setFailed(false);
    setClassId(value);
  }

  return <section className="panel" id="boletins">
    <div className="panel-heading"><div><span className="eyebrow">SOMENTE CONSULTA</span><h2>Boletins dos alunos</h2></div><FileText size={21} /></div>
    <p className="panel-description">Boletins enviados pela coordenação, dos alunos das suas turmas.</p>
    {classes.length === 0 ? <p className={styles.empty}>Nenhuma turma atribuída.</p> : <>
      {classes.length > 1 && <label className={styles.field}>Turma<select value={classId} onChange={(event) => selectClass(event.target.value)}>
        {classes.map((item) => <option key={item.classId} value={item.classId}>{item.className}</option>)}
      </select></label>}
      {failed && <p className={styles.empty}>Os alunos desta turma não estão disponíveis agora.</p>}
      {students?.length === 0 && <p className={styles.empty}>Nenhum aluno matriculado nesta turma.</p>}
      {students && students.length > 0 && <label className={styles.field}>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
        <option value="" disabled>Selecionar…</option>
        {students.map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}
      </select></label>}
      {studentId && <FamilyReportsList key={studentId} studentId={studentId} />}
    </>}
  </section>;
}
