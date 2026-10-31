const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

export interface MetricsPeriod {
  from: string;
  to: string;
  days: number;
}

export function brazilDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function countDays(from: string, to: string): number {
  return Math.max(0, Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1);
}

/** Monday of the current week in Brasília up to today, matching the weekly rotation start. */
export function currentWeekPeriod(now: Date): MetricsPeriod {
  const to = brazilDate(now);
  const today = toUtc(to);
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const from = new Date(today - weekday * DAY_MS).toISOString().slice(0, 10);
  return { from, to, days: weekday + 1 };
}
