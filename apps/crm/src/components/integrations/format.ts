// Display helpers for the integrations screens. Lima time, es-PE (CLAUDE.md rule 8).

const dateFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
});
const dateTimeFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
});
const relative = new Intl.RelativeTimeFormat("es-PE", { numeric: "auto" });
const percent = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-PE");

export const formatDate = (date: Date | null) => (date ? dateFormat.format(date) : "—");
export const formatDateTime = (date: Date | null) => (date ? dateTimeFormat.format(date) : "—");
export const formatCount = (value: number) => integer.format(value);
export const formatPercent = (value: number | null) =>
  value === null ? "—" : percent.format(value);

// "hace 5 minutos", "ayer"; older than a week falls back to the date.
export function formatSince(date: Date | null, now: Date): string {
  if (!date) return "Nunca";
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return relative.format(value, unit);
    value = Math.round(value / size);
  }
  return dateFormat.format(date);
}
