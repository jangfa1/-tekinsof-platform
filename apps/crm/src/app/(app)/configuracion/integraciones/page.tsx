import { getDb } from "@tekinsof/core/db/client";
import { listAccounts } from "@tekinsof/core/integrations/accounts";
import { listAdForms } from "@tekinsof/core/integrations/ad-forms";
import { upcomingIntegrations } from "@tekinsof/core/integrations/catalog";
import { integrationOverview, overviewTotals } from "@tekinsof/core/integrations/overview";
import { listInboundEvents } from "@tekinsof/core/integrations/testing";
import type { Metadata } from "next";
import { IntegrationCard, UpcomingCard } from "@/components/integrations/integration-card";
import { IntegrationsHeader, KpiStrip } from "@/components/integrations/page-header";
import { TestPanel, type WebhookCheck } from "@/components/integrations/test-panel";
import { requirePermissionPage } from "@/lib/actor";
import { getEnv } from "@/lib/env";
import { currentOrganizationId } from "@/lib/organization";

export const metadata: Metadata = { title: "Integraciones" };

type SearchParams = Promise<{ tab?: string; proveedor?: string; estado?: string }>;

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermissionPage("integrations.manage");
  const params = await searchParams;
  const tab = params.tab === "pruebas" ? "pruebas" : "conexiones";
  const db = getDb();
  const env = getEnv();
  const organizationId = currentOrganizationId();
  const now = new Date();
  const overview = await integrationOverview(db, {
    organizationId,
    now,
    tiktokSecretConfigured: Boolean(env.TIKTOK_WEBHOOK_SECRET),
  });

  if (tab === "conexiones") {
    return (
      <div className="space-y-8">
        <IntegrationsHeader active="conexiones" />
        <KpiStrip totals={overviewTotals(overview)} />
        <section aria-labelledby="activas" className="space-y-4">
          <div>
            <h2 id="activas" className="font-display text-xl font-semibold">
              Integraciones activas
            </h2>
            <p className="text-sm text-fg-muted">
              Cada lead llega con su plataforma, formulario y campaña, y se asigna al equipo
              comercial al instante.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {overview.map((item) => (
              <IntegrationCard key={item.integration.id} item={item} now={now} />
            ))}
          </div>
        </section>
        <section aria-labelledby="proximas" className="space-y-4">
          <div>
            <h2 id="proximas" className="font-display text-xl font-semibold">
              Próximamente
            </h2>
            <p className="text-sm text-fg-muted">
              Conectores previstos para las siguientes fases de la plataforma.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcomingIntegrations.map((integration) => (
              <UpcomingCard key={integration.id} integration={integration} />
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const [events, forms, accounts] = await Promise.all([
    listInboundEvents(db, organizationId, {
      provider: (params.proveedor || undefined) as "meta" | undefined,
      status: (params.estado || undefined) as "error" | undefined,
    }),
    listAdForms(db, organizationId),
    listAccounts(db, organizationId),
  ]);
  const base = env.CRM_BASE_URL.replace(/\/$/, "");
  const googleForms = forms.filter((f) => f.provider === "google_ads" && f.hasKey && f.isActive);
  const lastSync = (id: string) =>
    overview.find((o) => o.integration.id === id)?.lastSyncAt ?? null;
  const checks: WebhookCheck[] = [
    {
      provider: "meta",
      name: "Meta (Facebook e Instagram)",
      url: `${base}/api/webhooks/meta`,
      checks: [
        { label: "Secreto de la app (META_APP_SECRET)", ok: Boolean(env.META_APP_SECRET) },
        { label: "Token de verificación", ok: Boolean(env.META_VERIFY_TOKEN) },
        {
          label: "Página conectada",
          ok: accounts.some((a) => a.provider === "meta" && a.status === "conectada"),
        },
      ],
      lastEventAt: lastSync("facebook"),
    },
    {
      provider: "google_ads",
      name: "Google Lead Forms",
      url: `${base}/api/webhooks/google-leads/<id-del-formulario>`,
      checks: [{ label: "Formulario con clave creado", ok: googleForms.length > 0 }],
      lastEventAt: lastSync("google"),
    },
    {
      provider: "tiktok",
      name: "TikTok Lead Ads",
      url: `${base}/api/webhooks/tiktok`,
      checks: [
        {
          label: "Secreto de firma (TIKTOK_WEBHOOK_SECRET)",
          ok: Boolean(env.TIKTOK_WEBHOOK_SECRET),
        },
      ],
      lastEventAt: lastSync("tiktok"),
    },
  ];

  return (
    <div className="space-y-8">
      <IntegrationsHeader active="pruebas" />
      <TestPanel
        checks={checks}
        events={events}
        googleForms={googleForms.map((f) => ({ id: f.id, name: f.name }))}
        filters={{ provider: params.proveedor, status: params.estado }}
        now={now}
      />
    </div>
  );
}
