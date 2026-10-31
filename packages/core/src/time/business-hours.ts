// Business hours for SLA and reminders: Monday–Friday 09:00–18:00 in Lima, excluding holidays.
// Peru has used a fixed UTC−05:00 offset without daylight saving since 1994, so Lima wall time is
// UTC minus 5 hours; if that ever changes, this file is the only place to update.
export const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// "YYYY-MM-DD" of the Lima calendar day containing `instant`.
export function limaDate(instant: Date): string {
  return new Date(instant.getTime() + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isBusinessDay(limaDay: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${limaDay}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(limaDay);
}

// UTC instant of `hour`:00 Lima time on the Lima day `limaDay`.
function limaHour(limaDay: string, hour: number): number {
  return Date.parse(`${limaDay}T00:00:00Z`) + hour * HOUR_MS - LIMA_OFFSET_MS;
}

function nextDay(limaDay: string): string {
  return new Date(Date.parse(`${limaDay}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// Adds `hours` of business time to `start` and returns the resulting UTC instant.
export function addBusinessHours(start: Date, hours: number, holidays: ReadonlySet<string>): Date {
  let remaining = hours * HOUR_MS;
  let cursor = start.getTime();
  let day = limaDate(start);
  for (let guard = 0; guard < 3660; guard++) {
    if (isBusinessDay(day, holidays)) {
      const open = limaHour(day, WORK_START_HOUR);
      const close = limaHour(day, WORK_END_HOUR);
      const from = Math.max(cursor, open);
      if (from < close) {
        const available = close - from;
        if (remaining <= available) return new Date(from + remaining);
        remaining -= available;
      }
    }
    day = nextDay(day);
    cursor = limaHour(day, 0);
  }
  throw new Error("addBusinessHours: no business day found within 10 years");
}

// Business time elapsed between two instants, in milliseconds (0 when `end` is not after `start`).
export function businessMsBetween(start: Date, end: Date, holidays: ReadonlySet<string>): number {
  let total = 0;
  let day = limaDate(start);
  const last = limaDate(end);
  for (let guard = 0; guard < 3660; guard++) {
    if (isBusinessDay(day, holidays)) {
      const from = Math.max(start.getTime(), limaHour(day, WORK_START_HOUR));
      const to = Math.min(end.getTime(), limaHour(day, WORK_END_HOUR));
      if (to > from) total += to - from;
    }
    if (day >= last) return total;
    day = nextDay(day);
  }
  return total;
}
