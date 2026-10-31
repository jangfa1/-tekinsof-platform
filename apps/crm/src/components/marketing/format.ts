import { formatAmount } from "@tekinsof/core/sales/quote-math";

// Display helpers for /marketing. Amounts arrive in PEN céntimos and ratios in basis points.

export const NONE = "—";

export const soles = (cents: number | null) =>
  cents === null ? NONE : `S/ ${formatAmount(cents)}`;

// Whole soles for tiles and chart labels: "S/ 1,235".
export function solesShort(cents: number | null): string {
  if (cents === null) return NONE;
  const whole = Math.round(cents / 100);
  return `S/ ${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export const count = (n: number) => n.toLocaleString("es-PE");

// 1234 bp → "12.3 %"; ROI may be negative.
export function percent(bp: number | null): string {
  if (bp === null) return NONE;
  return `${(bp / 100).toFixed(1)} %`;
}

export type Delta = {
  text: string;
  tone: "good" | "bad" | "flat";
  direction: "up" | "down" | "flat";
};

// Change against the previous period. `lowerIsBetter` flips the tone (CPL, CPO).
export function delta(
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): Delta | null {
  if (current === null || previous === null) return null;
  if (previous === 0)
    return current === 0 ? { text: "sin cambio", tone: "flat", direction: "flat" } : null;
  const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (change === 0) return { text: "sin cambio", tone: "flat", direction: "flat" };
  const up = change > 0;
  return {
    text: `${up ? "+" : ""}${change} %`,
    direction: up ? "up" : "down",
    tone: up !== lowerIsBetter ? "good" : "bad",
  };
}

// "2026-10-30" → "30 oct" (a Lima calendar day, formatted without shifting through UTC).
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function longRange(from: string, to: string): string {
  const format = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "medium" });
  return `${format.format(new Date(`${from}T00:00:00Z`))} – ${format.format(new Date(`${to}T00:00:00Z`))}`;
}

// Period keys: "2026-10-05" (day) or "2026-10" (month) → axis label.
export function periodLabel(key: string): string {
  if (key.length === 10) return shortDay(key);
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${key}-01T00:00:00Z`));
}
