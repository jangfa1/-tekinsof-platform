import type { FunnelStage } from "@tekinsof/core/marketing/dashboard";
import { Table } from "@/components/ui";
import { BarChart } from "./bar-chart";
import { count, percent } from "./format";

// Lead → contacted → qualified → opportunity → proposal → won, as ordered bars with the share
// that reached each stage from the previous one, plus the equivalent table.
export function Funnel({
  stages,
  medianFirstContactHours,
}: {
  stages: FunnelStage[];
  medianFirstContactHours: number | null;
}) {
  const note = (stage: FunnelStage) =>
    stage.fromPreviousBp === null ? undefined : `${percent(stage.fromPreviousBp)} del anterior`;
  return (
    <section aria-labelledby="funnel-title" className="space-y-4">
      <div>
        <h2 id="funnel-title" className="font-display text-xl font-semibold">
          Embudo comercial
        </h2>
        <p className="text-sm text-fg-muted">
          Cada etapa incluye a los leads que pasaron a las siguientes. Tiempo mediano al primer
          contacto:{" "}
          <span className="font-medium text-fg">
            {medianFirstContactHours === null
              ? "sin contactos todavía"
              : `${medianFirstContactHours.toLocaleString("es-PE")} horas laborables`}
          </span>
          .
        </p>
      </div>
      <BarChart
        title="Embudo comercial"
        bars={stages.map((stage) => ({
          key: stage.key,
          label: stage.label,
          value: stage.count,
          display: count(stage.count),
          note: note(stage),
        }))}
      />
      <Table<FunnelStage>
        caption="Embudo comercial por etapa"
        rows={stages}
        rowKey={(stage) => stage.key}
        columns={[
          { key: "stage", label: "Etapa", render: (stage) => stage.label },
          { key: "count", label: "Leads", numeric: true, render: (stage) => count(stage.count) },
          {
            key: "rate",
            label: "Pasan desde la etapa anterior",
            numeric: true,
            render: (stage) => percent(stage.fromPreviousBp),
          },
        ]}
      />
    </section>
  );
}
