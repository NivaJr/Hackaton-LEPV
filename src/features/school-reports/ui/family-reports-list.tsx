"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import styles from "@/features/family/ui/family.module.css";
import type { SchoolReportFile } from "../model";
import { reportFileUrl, schoolReportsApi } from "./api";

export function ReportLinks({ studentId, reports }: { studentId: string; reports: SchoolReportFile[] }) {
  if (reports.length === 0) return <p className={styles.empty}>Nenhum boletim disponível ainda.</p>;
  return <ul className={styles.recognitions}>
    {reports.map((report) => <li key={report.id}>
      <a href={reportFileUrl(studentId, report.id)} target="_blank" rel="noreferrer"><FileText size={14} /> {report.label}</a>
      <span className={styles.meta}>Enviado em {new Date(report.uploadedAt).toLocaleDateString("pt-BR")}</span>
    </li>)}
  </ul>;
}

export function OwnReportsSection({ studentId }: { studentId: string }) {
  return <section className="panel" id="boletins">
    <div className="panel-heading"><div><span className="eyebrow">SOMENTE CONSULTA</span><h2>Histórico escolar</h2></div><FileText size={21} /></div>
    <FamilyReportsList studentId={studentId} />
  </section>;
}

export function FamilyReportsList({ studentId }: { studentId: string }) {
  const [reports, setReports] = useState<SchoolReportFile[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    schoolReportsApi.list(studentId)
      .then((data) => { if (active) setReports(data.reports); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [studentId]);

  if (failed) return <p className={styles.empty}>Os boletins não estão disponíveis agora.</p>;
  if (!reports) return <p className={styles.empty}>Carregando…</p>;
  return <ReportLinks studentId={studentId} reports={reports} />;
}
