// Pure dashboard arithmetic. Money is integer céntimos in PEN; ratios are basis points
// (10000 = 100 %), so nothing a manager reads ever went through a floating-point division.

export type Currency = "PEN" | "USD";

// "3.7500" → 37500 (ten-thousandths of a sol per dollar). Malformed values fall back to 3.75.
export function parseRate(value: string | undefined): number {
  const match = /^(\d{1,4})(?:\.(\d{1,4}))?$/.exec(value?.trim() ?? "");
  if (!match) return 37500;
  return Number(match[1]) * 10000 + Number((match[2] ?? "").padEnd(4, "0"));
}

// round(numerator / denominator) with halves away from zero; denominator > 0.
export function divRound(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.floor((2 * abs + denominator) / (2 * denominator));
}

export function toPen(cents: number, currency: string, rate: number): number {
  return currency === "USD" ? divRound(cents * rate, 10000) : cents;
}

const per = (amount: number | null, count: number) =>
  amount === null || count === 0 ? null : divRound(amount, count);
const bp = (part: number, whole: number) => (whole === 0 ? null : divRound(part * 10000, whole));

export type Counts = {
  leads: number;
  contacted: number;
  qualified: number;
  opportunities: number;
  proposals: number;
  won: number;
  wonAmountCents: number;
  /** null when spend cannot be told apart for this row (landing, seller, lead-only filters). */
  spendCents: number | null;
};

export type Metrics = Counts & {
  cplCents: number | null;
  cpoCents: number | null;
  /** Won deals over leads. */
  conversionBp: number | null;
  /** Opportunities over leads. */
  opportunityRateBp: number | null;
  /** Won amount over spend. */
  roasBp: number | null;
  /** (won amount − spend) over spend; negative while spend is not yet recovered. */
  roiBp: number | null;
};

export const emptyCounts = (spend: number | null = 0): Counts => ({
  leads: 0,
  contacted: 0,
  qualified: 0,
  opportunities: 0,
  proposals: 0,
  won: 0,
  wonAmountCents: 0,
  spendCents: spend,
});

export function withMetrics(counts: Counts): Metrics {
  const spend = counts.spendCents;
  const paid = spend !== null && spend > 0;
  return {
    ...counts,
    cplCents: per(spend, counts.leads),
    cpoCents: per(spend, counts.opportunities),
    conversionBp: bp(counts.won, counts.leads),
    opportunityRateBp: bp(counts.opportunities, counts.leads),
    roasBp: paid ? bp(counts.wonAmountCents, spend) : null,
    roiBp: paid ? bp(counts.wonAmountCents - spend, spend) : null,
  };
}

// Median of non-negative numbers; the mean of the two middle values when the count is even.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
