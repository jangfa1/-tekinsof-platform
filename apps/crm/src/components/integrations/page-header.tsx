import type { IntegrationMetrics } from "@tekinsof/core/integrations/overview";
import { AlertTriangle, CalendarDays, Inbox, TrendingUp } from "lucide-react";
import Link from "next/link";
import { formatCount, formatPercent } from "./format";

export const INTEGRATIONS_PATH = "/configuracion/integraciones";

const tabs = [
  { id: "conexiones", label: "Conexiones", href: INTEGRATIONS_PATH },
  { id: "pruebas", label: "Pruebas", href: `${INTEGRATIONS_PATH}?tab=pruebas` },
] as const;

export type TabId = (typeof tabs)[number]["id"];

export function IntegrationsHeader({ active }: { active: TabId }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">Integraciones</h1>
        <p className="max-w-2xl text-fg-muted">
          El centro de conexiones de tu organización: conecta tus plataformas de anuncios y sigue
          cada lead desde que llega hasta que se convierte en oportunidad.
        </p>
      </div>
      <nav aria-label="Secciones de integraciones" className="border-b border-border">
        <ul className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={tab.id === active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 text-sm font-medium ${
                  tab.id === active
                    ? "border-fg text-fg"
                    : "border-transparent text-fg-muted hover:text-fg"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function KpiStrip({ totals }: { totals: IntegrationMetrics }) {
  const kpis = [
    { label: "Leads hoy", value: formatCount(totals.today), icon: Inbox },
    { label: "Leads este mes", value: formatCount(totals.month), icon: CalendarDays },
    { label: "Errores (30 días)", value: formatCount(totals.errors), icon: AlertTriangle },
    {
      label: "Conversión a oportunidad",
      value: formatPercent(totals.conversion),
      icon: TrendingUp,
    },
  ];
  return (
    <section aria-label="Resumen de integraciones">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[var(--radius-card)] border border-border bg-background p-5"
          >
            <dt className="flex items-center gap-2 text-sm text-fg-muted">
              <kpi.icon aria-hidden="true" className="size-4" />
              {kpi.label}
            </dt>
            <dd className="mt-2 font-display text-3xl font-bold tabular-nums">{kpi.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
