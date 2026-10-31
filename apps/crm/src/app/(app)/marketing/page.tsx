import { listCampaigns, listLandings } from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import { getMarketingDashboard } from "@tekinsof/core/marketing/dashboard";
import {
  comparisonLabel,
  type PeriodPreset,
  periodPresets,
  presetRange,
  previousRange,
} from "@tekinsof/core/marketing/periods";
import { grades } from "@tekinsof/core/scoring/options";
import { listUsers } from "@tekinsof/core/users/users";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/marketing/bar-chart";
import { BreakdownTable } from "@/components/marketing/breakdown-table";
import { Filters, type FilterValues } from "@/components/marketing/filters";
import { count, longRange, periodLabel, shortDay, soles } from "@/components/marketing/format";
import { Funnel } from "@/components/marketing/funnel";
import { Highlights } from "@/components/marketing/highlights";
import { Kpis } from "@/components/marketing/kpis";
import { TrendChart } from "@/components/marketing/trend-chart";
import { gradeLabels } from "@/components/scoring/score-card";
import { EmptyState } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Marketing" };

const sourceLabels: Record<string, string> = {
  web_form: "Formulario web",
  landing: "Landing",
  meta_lead_ads: "Formulario de Meta",
  google_lead_form: "Formulario de Google",
  tiktok_lead_ads: "Formulario de TikTok",
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Manual",
  event: "Evento",
  other: "Otro",
};
const platformOptions: { value: DashboardPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "organico", label: "Orgánico y directo" },
];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DashboardPlatform = NonNullable<Parameters<typeof getMarketingDashboard>[2]["platform"]>;
type Query = Partial<Record<keyof FilterValues, string>>;

// Explicit dates win when valid; otherwise the period shortcut, "Este mes" by default.
function resolveRange(
  query: Query,
  now: Date,
): { from: string; to: string; preset?: PeriodPreset } {
  const preset = periodPresets.find((p) => p === query.periodo);
  if (!preset && query.desde && query.hasta && DAY.test(query.desde) && DAY.test(query.hasta)) {
    if (query.desde <= query.hasta) return { from: query.desde, to: query.hasta };
  }
  const chosen = preset ?? "este-mes";
  return { ...presetRange(chosen, now), preset: chosen };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="font-display text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requirePermissionPage("dashboard.marketing");
  const query = await searchParams;
  const db = getDb();
  const range = resolveRange(query, new Date());
  const filters = {
    campaignId: query.campana && UUID.test(query.campana) ? query.campana : undefined,
    platform: platformOptions.find((p) => p.value === query.plataforma)?.value,
    source: query.origen && query.origen in sourceLabels ? query.origen : undefined,
    ownerId: query.vendedor || undefined,
    landingSlug: query.landing || undefined,
    grade: grades.find((g) => g === query.grado),
  };
  const previous = previousRange(range);
  const [current, before, campaigns, users, landings] = await Promise.all([
    getMarketingDashboard(db, actor, { ...filters, from: range.from, to: range.to }),
    getMarketingDashboard(db, actor, { ...filters, ...previous }),
    listCampaigns(db),
    listUsers(db),
    listLandings(db),
  ]);
  if (!current.ok) throw new Error(current.error.message);
  const data = current.data;

  const values: FilterValues = {
    desde: range.from,
    hasta: range.to,
    periodo: range.preset,
    campana: filters.campaignId,
    plataforma: filters.platform,
    origen: filters.source,
    vendedor: filters.ownerId,
    landing: filters.landingSlug,
    grado: filters.grade,
  };
  const options = {
    campana: campaigns.map((c) => ({ value: c.id, label: c.name })),
    plataforma: platformOptions,
    origen: Object.entries(sourceLabels).map(([value, label]) => ({ value, label })),
    vendedor: users
      .filter((u) => u.isActive && (u.role === "ventas" || u.role === "gerencia"))
      .map((u) => ({ value: u.id, label: u.name })),
    landing: landings.map((l) => ({ value: l.slug, label: l.title })),
    grado: Object.entries(gradeLabels).map(([value, label]) => ({ value, label })),
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Marketing</h1>
        <p className="text-fg-muted">
          {longRange(range.from, range.to)}
          {data.spendAsOf ? ` · gasto registrado al ${shortDay(data.spendAsOf)}` : ""}
        </p>
        <p className="text-sm text-fg-muted">
          Leads creados en el periodo. Las ventas cuentan los cierres hasta 90 días después de la
          llegada del lead, así que un periodo reciente todavía puede crecer.
        </p>
      </header>

      <Filters values={values} options={options} />

      {!data.spendComparable ? (
        <p role="note" className="rounded-[var(--radius-card)] bg-surface p-4 text-sm">
          El gasto no se puede separar por vendedor, landing, calificación u origen: con este filtro
          el gasto, el costo por lead, el costo por oportunidad y el ROI se muestran como «—».
        </p>
      ) : null}
      {data.unmappedSpendCents ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-warning p-4 text-sm">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {soles(data.unmappedSpendCents)} de gasto de Meta no está asociado a ninguna campaña:
            cuenta en su plataforma, pero no en la tabla de campañas.{" "}
            <Link href="/campanas" className="text-link underline">
              Asociar campañas
            </Link>
          </span>
        </p>
      ) : null}

      {data.totals.leads === 0 ? (
        <EmptyState
          title="Sin leads en este rango"
          text="Prueba con otro periodo o quita algún filtro."
          action={
            <Link href="/marketing" className="text-link underline">
              Ver este mes
            </Link>
          }
        />
      ) : (
        <>
          <Highlights
            highlights={data.highlights}
            byPlatform={data.byPlatform}
            byCampaign={data.byCampaign}
          />
          <Section id="kpis-title" title="Indicadores">
            <Kpis
              current={data.totals}
              previous={before.ok ? before.data.totals : data.totals}
              comparison={comparisonLabel(previous)}
            />
          </Section>
          <Section id="sources-title" title="Leads por fuente">
            <BarChart
              title="Leads por plataforma"
              bars={data.byPlatform.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.metrics.leads,
                display: count(row.metrics.leads),
              }))}
            />
            <BreakdownTable
              caption="Rendimiento por plataforma"
              dimension="Plataforma"
              rows={data.byPlatform}
              withSpend={data.spendComparable}
            />
          </Section>
          <Section id="campaigns-title" title="Rendimiento por campaña">
            <BreakdownTable
              caption="Rendimiento por campaña"
              dimension="Campaña"
              rows={data.byCampaign}
              withSpend={data.spendComparable}
              bestKey={data.highlights.bestCampaign}
            />
          </Section>
          <Funnel stages={data.funnel} medianFirstContactHours={data.medianFirstContactHours} />
          <Section
            id="trend-title"
            title={data.periodUnit === "day" ? "Leads por día" : "Leads por mes"}
          >
            <TrendChart
              title={data.periodUnit === "day" ? "Leads por día" : "Leads por mes"}
              points={data.byPeriod.map((row) => ({ key: row.key, value: row.metrics.leads }))}
            />
            <details>
              <summary className="min-h-9 cursor-pointer py-2 text-sm font-medium">
                Ver la tabla por {data.periodUnit === "day" ? "día" : "mes"}
              </summary>
              <BreakdownTable
                caption="Rendimiento por periodo"
                dimension="Periodo"
                rows={data.byPeriod.map((row) => ({ ...row, label: periodLabel(row.key) }))}
                withSpend={data.spendComparable}
              />
            </details>
          </Section>
          <div className="grid gap-8 xl:grid-cols-2">
            <Section id="landings-title" title="Por landing">
              <BreakdownTable
                caption="Rendimiento por landing"
                dimension="Landing"
                rows={data.byLanding}
                withSpend={false}
              />
            </Section>
            <Section id="owners-title" title="Por vendedor">
              <BreakdownTable
                caption="Rendimiento por vendedor"
                dimension="Vendedor"
                rows={data.byOwner}
                withSpend={false}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
