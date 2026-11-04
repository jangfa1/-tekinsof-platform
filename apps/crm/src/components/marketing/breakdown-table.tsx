import type { Row } from "@tekinsof/core/marketing/dashboard-groups";
import { Badge, Table } from "@/components/ui";
import { count, percent, soles } from "./format";

// One breakdown (platform, campaign, landing, seller, period) with the same columns everywhere.
// `withSpend` drops the spend-based columns where spend cannot be split (landing, seller).
export function BreakdownTable({
  caption,
  dimension,
  rows,
  withSpend,
  bestKey,
}: {
  caption: string;
  dimension: string;
  rows: Row[];
  withSpend: boolean;
  bestKey?: string | null;
}) {
  const spendColumns = withSpend
    ? [
        {
          key: "spend",
          label: "Gasto",
          numeric: true,
          render: (r: Row) => soles(r.metrics.spendCents),
        },
        { key: "cpl", label: "CPL", numeric: true, render: (r: Row) => soles(r.metrics.cplCents) },
        { key: "cpo", label: "CPO", numeric: true, render: (r: Row) => soles(r.metrics.cpoCents) },
        { key: "roi", label: "ROI", numeric: true, render: (r: Row) => percent(r.metrics.roiBp) },
      ]
    : [];
  return (
    <Table<Row>
      caption={caption}
      rows={rows}
      rowKey={(r) => r.key}
      columns={[
        {
          key: "name",
          label: dimension,
          render: (r) => (
            <span className="inline-flex flex-wrap items-center gap-2 font-medium">
              {r.label}
              {bestKey && r.key === bestKey ? (
                <Badge tone="success">Mejor rendimiento</Badge>
              ) : null}
            </span>
          ),
        },
        { key: "leads", label: "Leads", numeric: true, render: (r) => count(r.metrics.leads) },
        {
          key: "opportunities",
          label: "Oportunidades",
          numeric: true,
          render: (r) => count(r.metrics.opportunities),
        },
        { key: "won", label: "Ventas", numeric: true, render: (r) => count(r.metrics.won) },
        {
          key: "amount",
          label: "Monto ganado",
          numeric: true,
          render: (r) => soles(r.metrics.wonAmountCents),
        },
        ...spendColumns,
        {
          key: "conversion",
          label: "Conversión",
          numeric: true,
          render: (r) => percent(r.metrics.conversionBp),
        },
      ]}
    />
  );
}
