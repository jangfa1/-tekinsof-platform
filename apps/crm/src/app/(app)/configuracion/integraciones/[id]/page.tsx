import { listCampaigns } from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import { listAccounts } from "@tekinsof/core/integrations/accounts";
import { listAdForms } from "@tekinsof/core/integrations/ad-forms";
import { findActiveIntegration } from "@tekinsof/core/integrations/catalog";
import { integrationOverview } from "@tekinsof/core/integrations/overview";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdFormsTable } from "@/components/integrations/ad-forms-table";
import { CopyField } from "@/components/integrations/copy-button";
import { formatCount, formatSince } from "@/components/integrations/format";
import { GoogleFormCreate } from "@/components/integrations/google-form-create";
import { MetricRow } from "@/components/integrations/integration-card";
import { MetaAdAccounts } from "@/components/integrations/meta-ad-accounts";
import { MetaSettings } from "@/components/integrations/meta-settings";
import { INTEGRATIONS_PATH } from "@/components/integrations/page-header";
import { Monogram, StatusChip } from "@/components/integrations/status-chip";
import { Card } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";
import { getEnv } from "@/lib/env";
import { currentOrganizationId } from "@/lib/organization";
import {
  connectMetaAction,
  connectMetaAdAccountAction,
  createGoogleFormAction,
  disconnectAction,
  mapFormAction,
} from "../actions";

export const metadata: Metadata = { title: "Configurar integración" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | undefined>>;

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

// Redirect-based forms keep the page a server component; the outcome comes back in the URL.
function back(id: string, params: Record<string, string>): never {
  redirect(`${INTEGRATIONS_PATH}/${id}?${new URLSearchParams(params).toString()}`);
}

const tiktokSample = `{
  "lead_id": "7300000000000000001",
  "form_id": "7300000000000000100",
  "form_name": "ERP — TikTok",
  "campaign_id": "1780000000000000",
  "created_time": 1793450000,
  "fields": { "name": "Ana Torres", "email": "ana@empresa.pe", "phone": "959926642" }
}`;

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requirePermissionPage("integrations.manage");
  const { id } = await params;
  const integration = findActiveIntegration(id);
  if (!integration) notFound();
  const query = await searchParams;
  const db = getDb();
  const env = getEnv();
  const organizationId = currentOrganizationId();
  const now = new Date();

  const [overview, accounts, forms, campaigns] = await Promise.all([
    integrationOverview(db, {
      organizationId,
      now,
      tiktokSecretConfigured: Boolean(env.TIKTOK_WEBHOOK_SECRET),
    }),
    listAccounts(db, organizationId),
    listAdForms(db, organizationId),
    listCampaigns(db),
  ]);
  const item = overview.find((o) => o.integration.id === id);
  if (!item) notFound();
  const providerForms = forms.filter((f) => f.provider === integration.provider);
  const campaignOptions = campaigns.map((c) => ({ id: c.id, name: c.name }));

  async function connect(formData: FormData) {
    "use server";
    const input = {
      pageId: str(formData, "pageId"),
      displayName: str(formData, "displayName"),
      pageToken: str(formData, "pageToken"),
    };
    const result = await connectMetaAction(input);
    if (result.ok) back(id, { ok: "Página conectada" });
    // The token is never echoed back into the URL.
    const values = { pageId: input.pageId, displayName: input.displayName };
    const fields = Object.fromEntries(
      Object.entries(result.error.fields ?? {}).map(([k, v]) => [`f_${k}`, v]),
    );
    back(id, {
      ...values,
      ...fields,
      ...(result.error.fields ? {} : { error: result.error.message }),
    });
  }

  async function connectAdAccount(formData: FormData) {
    "use server";
    const input = {
      adAccountId: str(formData, "adAccountId"),
      displayName: str(formData, "displayName"),
      token: str(formData, "token"),
    };
    const result = await connectMetaAdAccountAction(input);
    if (result.ok) back(id, { ok: "Cuenta publicitaria conectada" });
    // Prefixed `a_` so its errors never land on the Page form; the token is never echoed back.
    const fields = Object.fromEntries(
      Object.entries(result.error.fields ?? {}).map(([k, v]) => [`a_${k}`, v]),
    );
    back(id, {
      a_adAccountIdValue: input.adAccountId,
      a_displayNameValue: input.displayName,
      ...fields,
      ...(result.error.fields ? {} : { error: result.error.message }),
    });
  }

  async function disconnect(formData: FormData) {
    "use server";
    const result = await disconnectAction({ accountId: str(formData, "accountId") });
    const done = str(formData, "kind") === "ad_account" ? "Cuenta publicitaria" : "Página";
    back(id, result.ok ? { ok: `${done} desconectada` } : { error: result.error.message });
  }

  async function mapForm(formData: FormData) {
    "use server";
    const result = await mapFormAction({
      adFormId: str(formData, "adFormId"),
      campaignId: str(formData, "campaignId"),
    });
    back(
      id,
      result.ok ? { ok: "Campaña del formulario guardada" } : { error: result.error.message },
    );
  }

  return (
    <div className="space-y-8">
      <Link
        href={INTEGRATIONS_PATH}
        className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Integraciones
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Monogram text={integration.monogram} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">{integration.name}</h1>
          <p className="text-fg-muted">{integration.description}</p>
          {integration.note ? <p className="text-sm text-fg-muted">{integration.note}</p> : null}
        </div>
        <StatusChip status={item.status} />
      </header>

      {query.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          {query.ok}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error}
        </p>
      ) : null}

      <section aria-label="Métricas" className="space-y-2">
        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">
            {formatCount(item.metrics.total)}
          </span>{" "}
          leads recibidos · última sincronización {formatSince(item.lastSyncAt, now)}
          {item.statusDetail ? ` · ${item.statusDetail}` : ""}
        </p>
        <MetricRow metrics={item.metrics} />
      </section>

      {integration.connection === "meta_page" ? (
        <MetaSettings
          accounts={accounts.filter((a) => a.provider === "meta" && a.accountType === "page")}
          connectAction={connect}
          disconnectAction={disconnect}
          fieldErrors={{
            pageId: query.f_pageId,
            displayName: query.f_displayName,
            pageToken: query.f_pageToken,
          }}
          values={{ pageId: query.pageId, displayName: query.displayName }}
          now={now}
        />
      ) : null}

      {integration.connection === "meta_page" ? (
        <MetaAdAccounts
          accounts={accounts.filter((a) => a.provider === "meta" && a.accountType === "ad_account")}
          connectAction={connectAdAccount}
          disconnectAction={disconnect}
          fieldErrors={{
            adAccountId: query.a_adAccountId,
            displayName: query.a_displayName,
            token: query.a_token,
          }}
          values={{ adAccountId: query.a_adAccountIdValue, displayName: query.a_displayNameValue }}
          now={now}
        />
      ) : null}

      {integration.connection === "google_form" ? (
        <Card title="Nuevo formulario de Google">
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Cada formulario de Google Ads tiene su propia URL de webhook y su clave.
            </p>
            <GoogleFormCreate action={createGoogleFormAction} campaigns={campaignOptions} />
          </div>
        </Card>
      ) : null}

      {integration.connection === "signed_webhook" ? (
        <Card title="Webhook firmado">
          <div className="space-y-4 text-sm">
            <p className="text-fg-muted">
              Configura esta URL en tu conector (LeadsBridge, Zapier o Make). Cada envío lleva la
              cabecera <code>X-Tekinsof-Signature: sha256=&lt;HMAC-SHA256 del cuerpo&gt;</code>{" "}
              firmada con el secreto TIKTOK_WEBHOOK_SECRET, que entrega Gerencia y nunca se muestra.
            </p>
            <CopyField
              value={`${env.CRM_BASE_URL.replace(/\/$/, "")}/api/webhooks/tiktok`}
              label="Copiar URL"
            />
            <p className="font-medium">Cuerpo esperado</p>
            <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface p-4 text-xs">
              {tiktokSample}
            </pre>
          </div>
        </Card>
      ) : null}

      <section aria-labelledby="forms" className="space-y-4">
        <div>
          <h2 id="forms" className="font-display text-xl font-semibold">
            Formularios
          </h2>
          <p className="text-sm text-fg-muted">
            Asigna cada formulario a una campaña para medir su costo por lead.
          </p>
        </div>
        <AdFormsTable
          forms={providerForms}
          campaigns={campaignOptions}
          mapAction={mapForm}
          emptyText={
            integration.connection === "google_form"
              ? "Crea tu primer formulario arriba."
              : "Los formularios aparecen solos cuando llega su primer lead."
          }
        />
      </section>
    </div>
  );
}
