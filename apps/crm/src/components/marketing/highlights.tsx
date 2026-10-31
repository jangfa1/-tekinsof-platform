import type { Highlights as HighlightKeys, Row } from "@tekinsof/core/marketing/dashboard-groups";
import { count, percent, solesShort } from "./format";

type Answer = { question: string; key: string | null; value: (row: Row) => string };

// The six business questions, answered in one line each. A ranking with no data says so instead
// of naming a winner by default.
export function Highlights({
  highlights,
  byPlatform,
  byCampaign,
}: {
  highlights: HighlightKeys;
  byPlatform: Row[];
  byCampaign: Row[];
}) {
  const answers: (Answer & { rows: Row[] })[] = [
    {
      question: "Plataforma con más leads",
      key: highlights.mostLeads,
      rows: byPlatform,
      value: (r) => `${count(r.metrics.leads)} leads`,
    },
    {
      question: "Plataforma con más oportunidades",
      key: highlights.mostOpportunities,
      rows: byPlatform,
      value: (r) => `${count(r.metrics.opportunities)} oportunidades`,
    },
    {
      question: "Plataforma con más ventas",
      key: highlights.mostWon,
      rows: byPlatform,
      value: (r) => `${count(r.metrics.won)} ventas · ${solesShort(r.metrics.wonAmountCents)}`,
    },
    {
      question: "Mejor costo por lead",
      key: highlights.bestCpl,
      rows: byPlatform,
      value: (r) => `${solesShort(r.metrics.cplCents)} por lead`,
    },
    {
      question: "Mejor conversión a venta",
      key: highlights.bestConversion,
      rows: byPlatform,
      value: (r) => `${percent(r.metrics.conversionBp)} de sus leads`,
    },
    {
      question: "Campaña con mejor rendimiento",
      key: highlights.bestCampaign,
      rows: byCampaign,
      value: (r) =>
        r.metrics.roiBp !== null
          ? `ROI ${percent(r.metrics.roiBp)}`
          : `${percent(r.metrics.conversionBp)} de conversión`,
    },
  ];

  return (
    <section aria-labelledby="highlights-title" className="space-y-4">
      <h2 id="highlights-title" className="font-display text-xl font-semibold">
        Respuestas rápidas
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {answers.map((answer) => {
          const row = answer.rows.find((r) => r.key === answer.key);
          return (
            <li
              key={answer.question}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-4"
            >
              <p className="text-sm text-fg-muted">{answer.question}</p>
              {row ? (
                <>
                  <p className="mt-1 font-display text-lg font-semibold">{row.label}</p>
                  <p className="text-sm">{answer.value(row)}</p>
                </>
              ) : (
                <p className="mt-1 font-medium text-fg-muted">Sin datos suficientes</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
