import { limaDate } from "../time/business-hours.ts";

// Dashboard periods as Lima calendar days ("YYYY-MM-DD", both ends inclusive). Pure date math on
// UTC midnights, so a month never starts or ends five hours early.

export const periodPresets = [
  "este-mes",
  "mes-anterior",
  "30-dias",
  "90-dias",
  "este-ano",
] as const;
export type PeriodPreset = (typeof periodPresets)[number];
export type DayRange = { from: string; to: string };

export const presetLabels: Record<PeriodPreset, string> = {
  "este-mes": "Este mes",
  "mes-anterior": "Mes anterior",
  "30-dias": "Últimos 30 días",
  "90-dias": "Últimos 90 días",
  "este-ano": "Este año",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, days: number) => iso(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
// Last day of the month `day` belongs to.
function monthEnd(day: string): string {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return iso(Date.UTC(y, m, 0));
}

export function presetRange(preset: PeriodPreset, now: Date): DayRange {
  const today = limaDate(now);
  switch (preset) {
    case "este-mes":
      return { from: monthStart(today), to: today };
    case "mes-anterior": {
      const last = addDays(monthStart(today), -1);
      return { from: monthStart(last), to: last };
    }
    case "30-dias":
      return { from: addDays(today, -29), to: today };
    case "90-dias":
      return { from: addDays(today, -89), to: today };
    case "este-ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

export const rangeDays = (range: DayRange) =>
  Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;

// The period a range is compared with. A range starting on the 1st inside one month compares
// with the same days of the previous month (1–15 Oct vs 1–15 Sep; all October vs all September);
// any other range with the same number of days right before it.
export function previousRange(range: DayRange): DayRange {
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
  if (range.from.endsWith("-01") && sameMonth) {
    const previousEnd = addDays(range.from, -1);
    const from = monthStart(previousEnd);
    const wholeMonth = range.to === monthEnd(range.to);
    const day = Number(range.to.slice(8, 10));
    const sameDay = `${previousEnd.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    const to = wholeMonth || sameDay > previousEnd ? previousEnd : sameDay;
    return { from, to };
  }
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(rangeDays(range) - 1)), to };
}

const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// "vs. septiembre" when the comparison is (part of) one month from its 1st, else generic.
export function comparisonLabel(previous: DayRange): string {
  if (previous.from.endsWith("-01") && previous.from.slice(0, 7) === previous.to.slice(0, 7)) {
    return `vs. ${monthNames[Number(previous.from.slice(5, 7)) - 1]}`;
  }
  return "vs. periodo anterior";
}
