import { CalendarDays } from "lucide-react";

const weeks = 52;
const days = Array.from({ length: weeks * 7 }, (_, index) => {
  const week = Math.floor(index / 7);
  const day = index % 7;
  if (week < 34) return 0;
  const seed = (week * 11 + day * 7) % 17;
  return seed < 8 ? 0 : seed < 12 ? 1 : seed < 15 ? 2 : seed === 15 ? 3 : 4;
});
const months = ["Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"];

export function ActivityHeatmap({ activityDays }: { activityDays: number }) {
  return <section className="panel frequency-panel">
    <div className="panel-heading"><div><span className="eyebrow">FREQUÊNCIA DE ESTUDOS</span><h2>{activityDays} dias de atividade no período</h2></div><span className="frequency-year"><CalendarDays size={15} />2026</span></div>
    <p className="panel-description">Calendário demonstrativo inspirado no histórico do GitHub. A API real ainda fornecerá os dias de atividade.</p>
    <div className="frequency-scroll" tabIndex={0} aria-label="Histórico demonstrativo de frequência de estudos">
      <div className="frequency-months">{months.map((month) => <span key={month}>{month}</span>)}</div>
      <div className="frequency-body"><div className="frequency-weekdays"><span>Seg</span><span>Qua</span><span>Sex</span></div><div className="frequency-grid">{days.map((intensity, index) => <span key={index} className={`frequency-cell level-${intensity}`} title={`Semana ${Math.floor(index / 7) + 1}, dia ${index % 7 + 1}: intensidade de atividade ${intensity}`} />)}</div></div>
    </div>
    <div className="frequency-footer"><span>Atividade fictícia · demonstração visual</span><div><small>Menos</small>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`frequency-cell level-${level}`} />)}<small>Mais</small></div></div>
  </section>;
}
