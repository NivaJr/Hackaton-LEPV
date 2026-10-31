"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { SUBJECTS } from "@/config/catalog";
import type { SubjectProgress } from "@/features/learning/client";

const axes = SUBJECTS.map((subject) => subject.name);

export function progressPercent({ earnedRankPoints, availableRankPoints }: SubjectProgress) {
  if (!Number.isFinite(earnedRankPoints) || !Number.isFinite(availableRankPoints) || availableRankPoints <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((earnedRankPoints / availableRankPoints) * 1_000) / 10));
}

function point(index: number, value: number, radius = 104) {
  const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const distance = radius * (value / 100);
  return [160 + Math.cos(angle) * distance, 160 + Math.sin(angle) * distance] as const;
}

function polygon(values: readonly number[]) {
  return values.map((value, index) => point(index, value).join(",")).join(" ");
}

export function SkillMatrix({ mode = "demo", difficultSkillCodes = [], subjectProgress = [] }: {
  mode?: "demo" | "real";
  difficultSkillCodes?: string[];
  subjectProgress?: SubjectProgress[];
}) {
  const progressBySubject = useMemo(() => new Map(subjectProgress.map((entry) => [entry.subjectId, entry])), [subjectProgress]);
  const values = SUBJECTS.map((subject) => progressPercent(progressBySubject.get(subject.id) ?? {
    subjectId: subject.id, earnedRankPoints: 0, availableRankPoints: 0,
  }));
  const grids = useMemo(() => [25, 50, 75, 100].map((level) => polygon(axes.map(() => level))), []);

  if (mode === "real" && !subjectProgress.length) return <section className="panel skill-matrix-panel">
    <div className="panel-heading"><div><span className="eyebrow">PROGRESSO POR CONTEÚDO</span><h2>Seu mapa de aprendizagem</h2></div></div>
    <p className="panel-description">O mapa será calculado quando o professor ou o coordenador publicar o total de pontos disponíveis para cada conteúdo.</p>
    {difficultSkillCodes.length ? <ul>{difficultSkillCodes.map((code) => <li key={code}>{code}</li>)}</ul> : <p>Nenhum conteúdo publicado com pontuação suficiente para calcular o percentual.</p>}
  </section>;

  return <section className="panel skill-matrix-panel">
    <div className="panel-heading"><div><span className="eyebrow">PROGRESSO POR DISCIPLINA</span><h2>Seu mapa de aprendizagem</h2></div>{mode === "demo" && <span className="subtle-pill"><Sparkles size={13} />Demo</span>}</div>
    <p className="panel-description">Cada percentual é calculado por <strong>pontos de patente conquistados ÷ pontos de patente disponíveis</strong> nos conteúdos publicados da disciplina.</p>
    <div className="skill-chart-wrap">
      <svg className="skill-radar" viewBox="0 0 320 320" role="img" aria-labelledby="skill-chart-title skill-chart-description">
        <title id="skill-chart-title">Progresso por pontos de patente em cada disciplina</title>
        <desc id="skill-chart-description">Gráfico radar com o percentual de pontos conquistados em relação aos pontos disponíveis em seis disciplinas.</desc>
        {grids.map((points, index) => <polygon key={points} points={points} className={`skill-grid level-${index + 1}`} />)}
        {axes.map((_, index) => { const [x, y] = point(index, 100); return <line key={index} x1="160" y1="160" x2={x} y2={y} className="skill-axis" />; })}
        <polygon points={polygon(values)} className="skill-shape" />
        {values.map((value, index) => { const [x, y] = point(index, value); return <circle key={index} cx={x} cy={y} r="4" className="skill-point" />; })}
      </svg>
      <span className="skill-label label-top">Matemática</span><span className="skill-label label-top-right">Português</span><span className="skill-label label-bottom-right">Inglês</span><span className="skill-label label-bottom">História</span><span className="skill-label label-bottom-left">Geografia</span><span className="skill-label label-top-left">Biologia</span>
    </div>
    <div className="subject-progress-legend" aria-label="Detalhamento do progresso por disciplina">{SUBJECTS.map((subject, index) => {
      const progress = progressBySubject.get(subject.id);
      return <span key={subject.id}><i style={{ width: `${values[index]}%` }} /><b>{subject.name}</b><small>{progress ? `${progress.earnedRankPoints.toLocaleString("pt-BR")} de ${progress.availableRankPoints.toLocaleString("pt-BR")} pontos` : "Sem pontos publicados"}</small><strong>{values[index].toLocaleString("pt-BR")}%</strong></span>;
    })}</div>
  </section>;
}
