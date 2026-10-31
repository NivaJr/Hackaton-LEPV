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
  const labels = mode === "demo" ? months : ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return <section className="panel frequency-panel">
    <div className="panel-heading"><div><span className="eyebrow">FREQUÊNCIA DE ESTUDOS</span><h2>{activityDays} dias de atividade no período</h2></div><span className="frequency-year"><CalendarDays size={15} />{schoolYear}</span></div>
    <p className="panel-description">{mode === "demo" ? "Calendário demonstrativo inspirado no histórico do GitHub. Os dias abaixo são fictícios." : "Dias com respostas registradas no servidor, no horário de Brasília."}</p>
    <div className="frequency-scroll" tabIndex={0} aria-label={mode === "demo" ? "Histórico demonstrativo de frequência de estudos" : "Histórico de dias com respostas registradas"}>
      <div className="frequency-months">{labels.map((month) => <span key={month}>{month}</span>)}</div>
      <div className="frequency-body"><div className="frequency-weekdays"><span>Seg</span><span>Qua</span><span>Sex</span></div><div className="frequency-grid">{mode === "demo" ? days.map((intensity, index) => <span key={index} className={`frequency-cell level-${intensity}`} title={`Semana ${Math.floor(index / 7) + 1}, dia ${index % 7 + 1}: intensidade de atividade ${intensity}`} />) : calendar.map((day, index) => <span key={day.date || `pad-${index}`} className={`frequency-cell level-${day.active ? 3 : 0}`} title={day.date ? `${day.date.split("-").reverse().join("/")}: ${day.active ? "com respostas" : "sem respostas"}` : undefined} aria-hidden={!day.date || undefined} />)}</div></div>
    </div>
    <div className="frequency-footer"><span>{mode === "demo" ? "Atividade fictícia · demonstração visual" : "Datas reais de respostas no período"}</span><div>{mode === "demo" ? <><small>Menos</small>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`frequency-cell level-${level}`} />)}<small>Mais</small></> : <><i className="frequency-cell level-0" /><small>Sem respostas</small><i className="frequency-cell level-3" /><small>Com respostas</small></>}</div></div>
    {mode === "real" && <details><summary>Consultar datas registradas</summary>{activityDates.length ? <ul>{activityDates.map((day) => <li key={day}><time dateTime={day}>{day.split("-").reverse().join("/")}</time></li>)}</ul> : <p>Nenhuma resposta registrada no período.</p>}</details>}
  </section>;
}
