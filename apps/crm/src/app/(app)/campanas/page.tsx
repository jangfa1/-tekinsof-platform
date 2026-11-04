import { listCampaigns } from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import { listUnmappedCampaigns, spendByCampaign } from "@tekinsof/core/marketing/spend";
import { limaDate } from "@tekinsof/core/time/business-hours";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CAMPAIGNS_PATH, channelLabels, formatDay, money } from "@/components/campaigns/labels";
import { Badge, Button, EmptyState, Select, Table } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";
import { mapCampaignAction } from "./actions";

export const metadata: Metadata = { title: "Campañas" };

type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];

const metaIds = (campaign: Campaign) =>
  ((campaign.externalRefs ?? {}) as Record<string, string[]>).meta ?? [];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermissionPage("campaigns.write");
  const query = await searchParams;
  const db = getDb();
  const monthStart = `${limaDate(new Date()).slice(0, 7)}-01`;
  const [campaigns, unmapped, spend] = await Promise.all([
    listCampaigns(db),
    listUnmappedCampaigns(db),
    spendByCampaign(db, monthStart),
  ]);
  const monthSpend = (campaignId: string) =>
    spend
      .filter((row) => row.campaignId === campaignId && row.spendCents > 0)
      .map((row) => money(row.spendCents, row.currency))
      .join(" + ") || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Campañas</h1>
          <p className="mt-1 text-fg-muted">
            Gasto por campaña para calcular el costo por lead. Las campañas nuevas se crean en{" "}
            <Link href="/landings" className="text-link underline underline-offset-2">
              Landings
            </Link>
            .
          </p>
        </div>
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

      {unmapped.length > 0 ? (
        <section
          aria-labelledby="unmapped-title"
          className="space-y-4 rounded-[var(--radius-card)] border border-warning bg-surface p-6"
        >
          <h2
            id="unmapped-title"
            className="flex items-center gap-2 font-display text-xl font-semibold"
          >
            <TriangleAlert aria-hidden="true" className="size-5 text-warning" />
            {unmapped.length === 1
              ? "1 campaña de Meta sin asociar"
              : `${unmapped.length} campañas de Meta sin asociar`}
          </h2>
          <p className="text-sm text-fg-muted">
            Su gasto ya está guardado, pero no aparece en los reportes hasta que la asocies con una
            campaña del CRM. Al asociarla se recuperan todos sus días.
          </p>
          <ul className="divide-y divide-border">
            {unmapped.map((item) => (
              <li
                key={item.externalCampaignId}
                className="flex flex-wrap items-end justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium">{item.name ?? "Campaña sin nombre"}</p>
                  <p className="text-sm text-fg-muted">
                    ID {item.externalCampaignId} ·{" "}
                    <span className="tabular-nums">{money(item.spendCents, item.currency)}</span>{" "}
                    del {formatDay(item.firstDate)} al {formatDay(item.lastDate)}
                  </p>
                </div>
                <form action={mapCampaignAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="externalCampaignId" value={item.externalCampaignId} />
                  <div>
                    <label
                      htmlFor={`map-${item.externalCampaignId}`}
                      className="block text-sm font-medium"
                    >
                      Campaña del CRM
                    </label>
                    <Select id={`map-${item.externalCampaignId}`} name="campaignId" required>
                      <option value="">Elige una campaña</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit">Asociar</Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          title="Aún no hay campañas"
          text="Crea la primera desde Landings para registrar su gasto."
        />
      ) : (
        <Table<Campaign>
          caption="Campañas"
          rows={campaigns}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              label: "Campaña",
              render: (row) => (
                <Link
                  href={`${CAMPAIGNS_PATH}/${row.id}/gasto`}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "channel",
              label: "Canal",
              render: (row) => channelLabels[row.channel] ?? row.channel,
            },
            {
              key: "meta",
              label: "Meta",
              render: (row) => {
                const ids = metaIds(row);
                if (ids.length > 0) {
                  return (
                    <Badge tone="success">{`${ids.length} asociada${ids.length === 1 ? "" : "s"}`}</Badge>
                  );
                }
                return row.channel === "meta_ads" ? <Badge tone="warning">Sin asociar</Badge> : "—";
              },
            },
            {
              key: "spend",
              label: "Gasto del mes",
              numeric: true,
              render: (row) => <span className="tabular-nums">{monthSpend(row.id)}</span>,
            },
            {
              key: "state",
              label: "Estado",
              render: (row) => (row.isActive ? "Activa" : "Inactiva"),
            },
          ]}
        />
      )}
    </div>
  );
}
