"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

const axes = ["Matemática", "Português", "Inglês", "História", "Geografia", "Biologia"];
const profiles = {
  geral: [78, 72, 61, 68, 75, 66],
  linguagens: [32, 84, 76, 48, 42, 45],
  humanas: [40, 58, 45, 82, 86, 55],
  exatas: [88, 52, 42, 46, 61, 73],
} as const;

type Profile = keyof typeof profiles;

function point(index: number, value: number, radius = 104) {
  const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const distance = radius * (value / 100);
  return [160 + Math.cos(angle) * distance, 160 + Math.sin(angle) * distance] as const;
}

function polygon(values: readonly number[]) {
  return values.map((value, index) => point(index, value).join(",")).join(" ");
}

export function SkillMatrix() {
  const [profile, setProfile] = useState<Profile>("geral");
  const values = profiles[profile];
  const grids = useMemo(() => [25, 50, 75, 100].map((level) => polygon(axes.map(() => level))), []);

  return <section className="panel skill-matrix-panel">
    <div className="panel-heading"><div><span className="eyebrow">MATRIZ DE HABILIDADES</span><h2>Seu mapa de aprendizagem</h2></div><span className="subtle-pill"><Sparkles size={13} />Demo</span></div>
    <p className="panel-description">Visualização provisória inspirada em painéis de skills. Os valores ainda não representam avaliação pedagógica.</p>
    <div className="skill-tabs" role="tablist" aria-label="Área da matriz de habilidades">{([
      ["geral", "Visão geral"], ["linguagens", "Linguagens"], ["humanas", "Humanas"], ["exatas", "Exatas e Ciências"],
    ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={profile === key} className={profile === key ? "active" : ""} onClick={() => setProfile(key)}>{label}</button>)}</div>
    <div className="skill-chart-wrap">
      <svg className="skill-radar" viewBox="0 0 320 320" role="img" aria-labelledby="skill-chart-title skill-chart-description">
        <title id="skill-chart-title">Matriz demonstrativa de habilidades por matéria</title>
        <desc id="skill-chart-description">Gráfico radar com seis matérias e valores demonstrativos de zero a cem.</desc>
        {grids.map((points, index) => <polygon key={points} points={points} className={`skill-grid level-${index + 1}`} />)}
        {axes.map((_, index) => { const [x, y] = point(index, 100); return <line key={index} x1="160" y1="160" x2={x} y2={y} className="skill-axis" />; })}
        <polygon points={polygon(values)} className="skill-shape" />
        {values.map((value, index) => { const [x, y] = point(index, value); return <circle key={index} cx={x} cy={y} r="4" className="skill-point" />; })}
      </svg>
      <span className="skill-label label-top">Matemática</span><span className="skill-label label-top-right">Português</span><span className="skill-label label-bottom-right">Inglês</span><span className="skill-label label-bottom">História</span><span className="skill-label label-bottom-left">Geografia</span><span className="skill-label label-top-left">Biologia</span>
    </div>
    <div className="skill-values">{axes.map((axis, index) => <span key={axis}><i style={{ width: `${values[index]}%` }} /><b>{axis}</b><small>{values[index]}%</small></span>)}</div>
  </section>;
}
