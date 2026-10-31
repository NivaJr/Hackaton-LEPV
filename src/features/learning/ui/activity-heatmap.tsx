import { CalendarDays } from "lucide-react";

const weeks = 52;
const days = Array.from({ length: weeks * 7 }, (_, index) => {
  const week = Math.floor(index / 7);
  const day = index % 7;
  if (week < 34) return 0;
  const seed = (week * 11 + day * 7) % 17;
  return seed < 8 ? 0 : seed < 12 ? 1 : seed < 15 ? 2 : seed === 15 ? 3 : 4;
});
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const weekdays = ["S", "T", "Q", "Q", "S", "S", "D"];

export function ActivityHeatmap({ activityDays, mode = "demo", activityDates = [], schoolYear = 2026 }: { activityDays: number; mode?: "demo" | "real"; activityDates?: string[]; schoolYear?: number }) {
  const registered = new Set(activityDates);
  const calendar: { date: string; active: boolean }[] = [];
  const start = new Date(Date.UTC(schoolYear, 0, 1));
  const offset = (start.getUTCDay() + 6) % 7;
  for (let index = 0; index < offset; index++) calendar.push({ date: "", active: false });
  for (const day = new Date(start); day.getUTCFullYear() === schoolYear; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    calendar.push({ date, active: registered.has(date) });
  }
  const cells = mode === "demo" ? days.map((intensity, index) => ({
    key: `demo-${index}`,
    intensity,
    title: `Semana ${Math.floor(index / 7) + 1}, dia ${index % 7 + 1}: intensidade de atividade ${intensity}`,
    hidden: true,
  })) : calendar.map((day, index) => ({
    key: day.date || `pad-${index}`,
    intensity: day.active ? 3 : 0,
    title: day.date ? `${day.date.split("-").reverse().join("/")}: ${day.active ? "com respostas" : "sem respostas"}` : undefined,
    hidden: !day.date,
  }));
  return <section className="panel frequency-panel">
    <div className="panel-heading"><div><span className="eyebrow">FREQUÊNCIA DE ESTUDOS</span><h2>{activityDays} dias de atividade no período</h2></div><span className="frequency-year"><CalendarDays size={15} />{schoolYear}</span></div>
    <p className="panel-description">{mode === "demo" ? "Calendário demonstrativo inspirado no histórico do GitHub. Os dias abaixo são fictícios." : "Dias com respostas registradas no servidor, no horário de Brasília."}</p>
    <div className="frequency-vertical" aria-label={mode === "demo" ? "Histórico demonstrativo de frequência de estudos" : "Histórico de dias com respostas registradas"}>
      <div className="frequency-weekday-header" aria-hidden="true">{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="frequency-body"><div className="frequency-months" aria-hidden="true">{months.map((month) => <span key={month}>{month}</span>)}</div><div className="frequency-grid">{cells.map((cell) => <span key={cell.key} className={`frequency-cell level-${cell.intensity}`} title={cell.title} aria-hidden={cell.hidden || undefined} />)}</div></div>
    </div>
    <div className="frequency-footer"><span>{mode === "demo" ? "Atividade fictícia · demonstração visual" : "Datas reais de respostas no período"}</span><div>{mode === "demo" ? <><small>Menos</small>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`frequency-cell level-${level}`} />)}<small>Mais</small></> : <><i className="frequency-cell level-0" /><small>Sem respostas</small><i className="frequency-cell level-3" /><small>Com respostas</small></>}</div></div>
    {mode === "real" && <details><summary>Consultar datas registradas</summary>{activityDates.length ? <ul>{activityDates.map((day) => <li key={day}><time dateTime={day}>{day.split("-").reverse().join("/")}</time></li>)}</ul> : <p>Nenhuma resposta registrada no período.</p>}</details>}
  </section>;
}
