import { type Counts, emptyCounts, type Metrics, withMetrics } from "./metrics.ts";

// Aggregation helpers for dashboard.ts: rows keyed by a breakdown (platform, campaign, landing,
// seller, period), the period keys of a range and the rankings that answer "which is best".

const DAY_MS = 24 * 60 * 60 * 1000;
export const PAID_PLATFORMS = ["facebook", "instagram", "google", "tiktok"] as const;

export type Row = { key: string; label: string; metrics: Metrics };

/** One lead's contribution: 0/1 per stage plus its won amount in PEN céntimos. */
export type Stages = Pick<
  Counts,
  "contacted" | "qualified" | "opportunities" | "proposals" | "won"
> & {
  wonAmountCents: number;
};

export type Highlights = {
  mostLeads: string | null;
  mostOpportunities: string | null;
  mostWon: string | null;
  bestCpl: string | null;
  bestConversion: string | null;
  bestCampaign: string | null;
};

export class Groups {
  private rows = new Map<string, { label: string; counts: Counts }>();
  private spend: boolean;
  constructor(spend: boolean) {
    this.spend = spend;
  }
  get(key: string, label: string) {
    let row = this.rows.get(key);
    if (!row) {
      row = { label, counts: emptyCounts(this.spend ? 0 : null) };
      this.rows.set(key, row);
    }
    return row.counts;
  }
  addLead(key: string, label: string, stages: Stages) {
    const counts = this.get(key, label);
    counts.leads++;
    counts.contacted += stages.contacted;
    counts.qualified += stages.qualified;
    counts.opportunities += stages.opportunities;
    counts.proposals += stages.proposals;
    counts.won += stages.won;
    counts.wonAmountCents += stages.wonAmountCents;
  }
  addSpend(key: string, label: string, cents: number) {
    const counts = this.get(key, label);
    if (counts.spendCents !== null) counts.spendCents += cents;
  }
  list(order?: string[]): Row[] {
    const rows = [...this.rows].map(([key, row]) => ({
      key,
      label: row.label,
      metrics: withMetrics(row.counts),
    }));
    if (order) return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return rows.sort((a, b) => b.metrics.leads - a.metrics.leads || a.label.localeCompare(b.label));
  }
}

export function periodKeys(from: string, to: string): { unit: "day" | "month"; keys: string[] } {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  const unit = days > 62 ? "month" : "day";
  const keys: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, unit === "day" ? 10 : 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return { unit, keys };
}

// The winner of a ranking among rows with data; ties go to the first in display order.
function best(rows: Row[], value: (m: Metrics) => number | null, lowest = false): string | null {
  let winner: Row | null = null;
  for (const row of rows) {
    const v = value(row.metrics);
    if (v === null) continue;
    const current = winner ? value(winner.metrics) : null;
    if (current === null || (lowest ? v < current : v > current)) winner = row;
  }
  return winner?.key ?? null;
}

export function highlights(byPlatform: Row[], byCampaign: Row[]): Highlights {
  const paid = byPlatform.filter((row) => (PAID_PLATFORMS as readonly string[]).includes(row.key));
  const positive = (n: number) => (n > 0 ? n : null);
  const ranked = byCampaign.filter((row) => row.key !== "sin_campana");
  return {
    mostLeads: best(paid, (m) => positive(m.leads)),
    mostOpportunities: best(paid, (m) => positive(m.opportunities)),
    mostWon: best(paid, (m) => positive(m.won)),
    bestCpl: best(paid, (m) => m.cplCents, true),
    // Without a single sale nobody "converts best" or "performs best": no winner is named.
    bestConversion: best(paid, (m) => (m.won > 0 ? m.conversionBp : null)),
    // Return on spend among campaigns with sales; without spend, their conversion.
    bestCampaign:
      best(ranked, (m) => (m.won > 0 ? m.roiBp : null)) ??
      best(ranked, (m) => (m.won > 0 ? m.conversionBp : null)),
  };
}
