"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { getSubject } from "@/config/catalog";
import { recognitionApi, type StudentRecognitions } from "@/features/recognition/ui/api";
import styles from "./family.module.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export function RecognitionsContent({ data }: { data: StudentRecognitions }) {
  return <>
    {data.annualPoints && <p className={styles.meta}>{data.annualPoints.points} pontos de patente em {data.annualPoints.schoolYear}. Elogios não entram no XP nem no ranking.</p>}
    {data.recognitions.length === 0 ? <p className={styles.empty}>Nenhum elogio registrado ainda.</p> : <ul className={styles.recognitions}>
      {data.recognitions.map((item) => <li key={item.id}>
        <strong>{item.reasonLabel}</strong>
        {item.note && <p>{item.note}</p>}
        <span className={styles.meta}>{item.teacherName} · {getSubject(item.subjectId).name} · {dateFormatter.format(new Date(item.createdAt))} · {item.points} pontos</span>
      </li>)}
    </ul>}
  </>;
}

export function RecognitionsPanel({ studentId }: { studentId: string }) {
  const [data, setData] = useState<StudentRecognitions | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    recognitionApi.forStudent(studentId)
      .then((loaded) => { if (active) setData(loaded); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [studentId]);

  return <section className="panel" id="elogios">
    <div className="panel-heading"><div><span className="eyebrow">POR COMPORTAMENTO</span><h2>Elogios dos professores</h2></div><Award size={21} /></div>
    {failed && <p className={styles.empty}>Os elogios ainda não estão disponíveis.</p>}
    {!failed && !data && <p className={styles.empty}>Carregando…</p>}
    {data && <RecognitionsContent data={data} />}
  </section>;
}
