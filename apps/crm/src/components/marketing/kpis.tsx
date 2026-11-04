import type { Metrics } from "@tekinsof/core/marketing/metrics";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { count, type Delta, delta, percent, solesShort } from "./format";

type Tile = { label: string; value: string; detail?: string; change: Delta | null };

const tones = { good: "text-success", bad: "text-destructive", flat: "text-fg-muted" } as const;
const icons = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

// Eight stat tiles with their change against the previous period. The change carries an arrow
// and a sign, never color alone; for CPL and CPO going down is the good direction.
export function Kpis({
  current,
  previous,
  comparison,
}: {
  current: Metrics;
  previous: Metrics;
  comparison: string;
}) {
  const tiles: Tile[] = [
    { label: "Leads", value: count(current.leads), change: delta(current.leads, previous.leads) },
    {
      label: "Oportunidades",
      value: count(current.opportunities),
      change: delta(current.opportunities, previous.opportunities),
    },
    {
      label: "Ventas",
      value: count(current.won),
      detail: solesShort(current.wonAmountCents),
      change: delta(current.wonAmountCents, previous.wonAmountCents),
    },
    {
      label: "Gasto",
      value: solesShort(current.spendCents),
      change: delta(current.spendCents, previous.spendCents),
    },
    {
      label: "Costo por lead",
      value: solesShort(current.cplCents),
      change: delta(current.cplCents, previous.cplCents, true),
    },
    {
      label: "Costo por oportunidad",
      value: solesShort(current.cpoCents),
      change: delta(current.cpoCents, previous.cpoCents, true),
    },
    {
      label: "Conversión a venta",
      value: percent(current.conversionBp),
      detail: `${percent(current.opportunityRateBp)} a oportunidad`,
      change: delta(current.conversionBp, previous.conversionBp),
    },
    { label: "ROI", value: percent(current.roiBp), change: delta(current.roiBp, previous.roiBp) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.change ? icons[tile.change.direction] : null;
        return (
          <div
            key={tile.label}
            className="rounded-[var(--radius-card)] border border-border bg-background p-4"
          >
            <dt className="text-sm text-fg-muted">{tile.label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold">{tile.value}</dd>
            {tile.detail ? <dd className="text-sm text-fg-muted">{tile.detail}</dd> : null}
            <dd className="mt-2 text-sm">
              {tile.change && Icon ? (
                <span className={`inline-flex items-center gap-1 ${tones[tile.change.tone]}`}>
                  <Icon aria-hidden="true" className="size-4" />
                  <span className="tabular-nums">{tile.change.text}</span>
                  <span className="text-fg-muted">{comparison}</span>
                </span>
              ) : (
                <span className="text-fg-muted">
                  Sin datos para comparar {comparison.replace(/^vs\. /, "con ")}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
