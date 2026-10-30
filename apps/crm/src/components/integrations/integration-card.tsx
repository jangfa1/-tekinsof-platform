import type { UpcomingIntegration } from "@tekinsof/core/integrations/catalog";
import type { IntegrationMetrics, IntegrationOverview } from "@tekinsof/core/integrations/overview";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatCount, formatDate, formatPercent, formatSince } from "./format";
import { Monogram, StatusChip } from "./status-chip";

export function MetricRow({ metrics }: { metrics: IntegrationMetrics }) {
  const cells = [
    { label: "Hoy", value: formatCount(metrics.today) },
    { label: "Este mes", value: formatCount(metrics.month) },
    { label: "Errores", value: formatCount(metrics.errors) },
    { label: "Conversión", value: formatPercent(metrics.conversion) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-border bg-border sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-surface px-3 py-2">
          <dt className="text-xs text-fg-muted">{cell.label}</dt>
          <dd className="font-display text-lg font-bold tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IntegrationCard({ item, now }: { item: IntegrationOverview; now: Date }) {
  const { integration } = item;
  const connected = item.status !== "desconectado";
  const facts = [
    { label: "Cuenta", value: item.accountName ?? "Sin configurar" },
    { label: "Conectada desde", value: formatDate(item.connectedAt) },
    { label: "Última sincronización", value: formatSince(item.lastSyncAt, now) },
    { label: "Responsable", value: item.responsible ?? "—" },
  ];
  return (
    <article
      aria-labelledby={`int-${integration.id}`}
      className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-background p-6"
    >
      <header className="flex items-start gap-4">
        <Monogram text={integration.monogram} />
        <div className="min-w-0 flex-1">
          <h3 id={`int-${integration.id}`} className="font-display text-lg font-semibold">
            {integration.name}
          </h3>
          <p className="text-sm text-fg-muted">{integration.category}</p>
        </div>
        <StatusChip status={item.status} />
      </header>

      <div className="space-y-1 text-sm">
        <p className="text-fg-muted">{integration.description}</p>
        {integration.note ? <p className="text-fg-muted">{integration.note}</p> : null}
        {item.statusDetail ? (
          <p className={item.status === "error" ? "font-medium text-destructive" : "font-medium"}>
            {item.statusDetail}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-fg-muted">{fact.label}</dt>
            <dd className="font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">
            {formatCount(item.metrics.total)}
          </span>{" "}
          leads recibidos en total
        </p>
        <MetricRow metrics={item.metrics} />
      </div>

      <Link
        href={`/configuracion/integraciones/${integration.id}`}
        aria-label={`${connected ? "Configurar" : "Conectar"} ${integration.name}`}
        className={`mt-auto inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium ${
          connected
            ? "border border-border hover:bg-surface"
            : "bg-primary text-primary-fg hover:opacity-90"
        }`}
      >
        {connected ? "Configurar" : "Conectar"}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  );
}

export function UpcomingCard({ integration }: { integration: UpcomingIntegration }) {
  return (
    <li className="flex items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-border bg-background p-5">
      <Monogram text={integration.monogram} muted />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display font-semibold">{integration.name}</h3>
          <span className="rounded-full border border-border px-2 py-1 text-xs font-medium text-fg-muted">
            Próximamente
          </span>
        </div>
        <p className="text-sm text-fg-muted">{integration.description}</p>
        <p className="text-xs text-fg-muted">{integration.category}</p>
      </div>
    </li>
  );
}
