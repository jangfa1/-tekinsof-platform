import { listCampaigns } from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import { listCampaignSpend, spendPlatforms } from "@tekinsof/core/marketing/spend";
import { limaDate } from "@tekinsof/core/time/business-hours";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CAMPAIGNS_PATH,
  channelLabels,
  formatDay,
  money,
  platformLabels,
} from "@/components/campaigns/labels";
import { Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";
import { mapCampaignAction, recordSpendAction, unmapCampaignAction } from "../../actions";

export const metadata: Metadata = { title: "Gasto de campaña" };

const DAY_MS = 24 * 60 * 60 * 1000;
const sourceLabels: Record<string, string> = {
  manual: "Manual",
  meta: "Meta (automático)",
  google_ads: "Google Ads (automático)",
  tiktok: "TikTok (automático)",
};

type SpendRow = Awaited<ReturnType<typeof listCampaignSpend>>[number];

export default async function CampaignSpendPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermissionPage("campaigns.write");
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const campaign = (await listCampaigns(db)).find((c) => c.id === id);
  if (!campaign) notFound();
  const now = Date.now();
  const yesterday = limaDate(new Date(now - DAY_MS));
  const rows = await listCampaignSpend(db, id, limaDate(new Date(now - 30 * DAY_MS)));
  const metaIds = ((campaign.externalRefs ?? {}) as Record<string, string[]>).meta ?? [];
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.spendCents);

  return (
    <div className="space-y-6">
      <Link
        href={CAMPAIGNS_PATH}
        className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Campañas
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{campaign.name}</h1>
        <p className="mt-1 text-fg-muted">
          {channelLabels[campaign.channel] ?? campaign.channel} · gasto de los últimos 30 días:{" "}
          <span className="font-medium text-fg tabular-nums">
            {[...totals].map(([currency, cents]) => money(cents, currency)).join(" + ") ||
              "sin registros"}
          </span>
        </p>
      </div>
      <div aria-live="polite">
        {query.ok ? (
          <p role="status" className="text-sm text-success">
            {query.ok}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Registrar gasto manual">
          <p className="mb-4 text-sm text-fg-muted">
            Para Google Ads, TikTok Ads o cualquier gasto que no llegue solo. Registrar otra vez el
            mismo día y plataforma corrige el monto.
          </p>
          <form action={recordSpendAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <Field id="spend-date" label="Fecha" error={query.e_date}>
              <Input
                name="date"
                type="date"
                required
                max={yesterday}
                defaultValue={query.v_date ?? yesterday}
              />
            </Field>
            <Field id="spend-platform" label="Plataforma" error={query.e_adPlatform}>
              <Select name="adPlatform" defaultValue="google">
                {spendPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platformLabels[platform]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="spend-amount" label="Monto" help="Ejemplo: 1250.50" error={query.e_amount}>
              <Input name="amount" inputMode="decimal" required defaultValue={query.v_amount} />
            </Field>
            <Field id="spend-currency" label="Moneda" error={query.e_currency}>
              <Select name="currency" defaultValue={campaign.currency}>
                <option value="PEN">Soles (S/)</option>
                <option value="USD">Dólares (US$)</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Registrar gasto</Button>
            </div>
          </form>
        </Card>

        <Card title="Campañas de Meta asociadas">
          <p className="mb-4 text-sm text-fg-muted">
            El gasto de estas campañas llega solo cada día a las 06:00, separado en Facebook e
            Instagram. El ID está en el Administrador de anuncios.
          </p>
          {metaIds.length > 0 ? (
            <ul className="mb-4 divide-y divide-border">
              {metaIds.map((externalId) => (
                <li key={externalId} className="flex items-center justify-between gap-4 py-2">
                  <span className="tabular-nums">{externalId}</span>
                  <form action={unmapCampaignAction}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="externalCampaignId" value={externalId} />
                    <input type="hidden" name="returnTo" value={campaign.id} />
                    <Button type="submit" variant="ghost">
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            action={mapCampaignAction}
            className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="returnTo" value={campaign.id} />
            <Field
              id="meta-campaign-id"
              label="ID de campaña en Meta"
              error={query.e_externalCampaignId}
            >
              <Input name="externalCampaignId" inputMode="numeric" required autoComplete="off" />
            </Field>
            <div>
              <Button type="submit">Asociar</Button>
            </div>
          </form>
        </Card>
      </div>

      <section aria-labelledby="spend-history" className="space-y-4">
        <h2 id="spend-history" className="font-display text-xl font-semibold">
          Últimos 30 días
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            title="Sin gasto registrado"
            text="Registra el gasto manual o asocia la campaña de Meta."
          />
        ) : (
          <Table<SpendRow>
            caption="Gasto diario de la campaña"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: "date", label: "Fecha", render: (row) => formatDay(row.date) },
              {
                key: "platform",
                label: "Plataforma",
                render: (row) => platformLabels[row.adPlatform] ?? row.adPlatform,
              },
              {
                key: "source",
                label: "Origen",
                render: (row) => sourceLabels[row.provider] ?? row.provider,
              },
              {
                key: "amount",
                label: "Gasto",
                numeric: true,
                render: (row) => money(row.spendCents, row.currency),
              },
              {
                key: "clicks",
                label: "Clics",
                numeric: true,
                render: (row) => row.clicks ?? "—",
              },
              {
                key: "leads",
                label: "Leads (plataforma)",
                numeric: true,
                render: (row) => row.platformLeads ?? "—",
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
