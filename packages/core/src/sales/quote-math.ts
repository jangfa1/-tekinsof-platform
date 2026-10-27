// Pure quote arithmetic. All money is integer céntimos; quantities and percentages arrive as decimal
// strings with at most 2 decimals (they are numeric(…, 2) columns) and are scaled to integers before
// any multiplication, so no floating-point value ever reaches a stored amount.
export const IGV_RATE_BP = 1800; // 18.00 % in basis points
export const APPROVAL_THRESHOLD_BP = 1000; // a discount above 10.00 % needs Gerencia's approval

export type QuoteLine = { quantity: string; unitPriceCents: number };
export type QuoteTotals = {
  subtotalCents: number;
  discountCents: number;
  igvCents: number;
  totalCents: number;
};

// "12.5" → 1250 (hundredths). Rejects more than 2 decimals, signs and exponents.
export function toHundredths(value: string): number {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal: ${value}`);
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

// round(numerator / denominator), halves rounded up; both operands non-negative integers.
export function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function lineTotalCents(line: QuoteLine): number {
  return divRoundHalfUp(toHundredths(line.quantity) * line.unitPriceCents, 100);
}

export function computeQuoteTotals(lines: readonly QuoteLine[], discountPct: string): QuoteTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const discountBp = toHundredths(discountPct);
  if (discountBp > 10000) throw new Error("Discount above 100%");
  const discountCents = divRoundHalfUp(subtotalCents * discountBp, 10000);
  const taxableCents = subtotalCents - discountCents;
  const igvCents = divRoundHalfUp(taxableCents * IGV_RATE_BP, 10000);
  return { subtotalCents, discountCents, igvCents, totalCents: taxableCents + igvCents };
}

export function requiresApproval(discountPct: string): boolean {
  return toHundredths(discountPct) > APPROVAL_THRESHOLD_BP;
}

// 123456 → "1,234.56" (Peruvian invoices use comma thousands and point decimals).
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}
