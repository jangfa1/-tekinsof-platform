import { can } from "@tekinsof/core/auth/permissions";
import { defaultBlock } from "@tekinsof/core/cms/block-schema";
import {
  type campaignInput,
  createCampaign,
  listCampaigns,
  listLandings,
  saveLanding,
} from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Landings" };

const statusLabels: Record<string, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  archivada: "Archivada",
};
const channelLabels: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  linkedin_ads: "LinkedIn Ads",
  tiktok_ads: "TikTok Ads",
  seo: "SEO",
  email: "Email",
  whatsapp: "WhatsApp",
  referral: "Referidos",
  event: "Evento",
  other: "Otro",
};
const dateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "short",
  timeStyle: "short",
});

type SearchParams = Promise<Record<string, string | undefined>>;
const str = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function back(params: Record<string, string>, hash = ""): never {
  redirect(`/landings?${new URLSearchParams(params).toString()}${hash}`);
}

function failure(
  error: { message: string; fields?: Record<string, string> },
  prefix: string,
  hash: string,
): never {
  const params: Record<string, string> = { error: error.message };
  for (const [field, message] of Object.entries(error.fields ?? {}))
    params[`${prefix}${field}`] = message;
  back(params, hash);
}

async function createLanding(formData: FormData) {
  "use server";
  const actor = await authorize("landings.write");
  if (!actor.ok) back({ error: actor.error.message });
  const result = await saveLanding(getDb(), actor.data, {
    title: str(formData, "title"),
    slug: str(formData, "slug"),
    campaignId: str(formData, "campaignId"),
    blocks: [defaultBlock("hero"), defaultBlock("form")],
  });
  if (!result.ok) failure(result.error, "l_", "#nueva-landing");
  redirect(`/landings/${result.data.landingId}`);
}

async function newCampaign(formData: FormData) {
  "use server";
  const actor = await authorize("campaigns.write");
  if (!actor.ok) back({ error: actor.error.message });
  const result = await createCampaign(getDb(), actor.data, {
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    channel: str(formData, "channel") as z.input<typeof campaignInput>["channel"],
    startsOn: str(formData, "startsOn"),
    endsOn: str(formData, "endsOn"),
  });
  if (!result.ok) failure(result.error, "c_", "#campanas");
  back({ ok: "Campaña creada" }, "#campanas");
}

export default async function LandingsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("landings.write");
  const params = await searchParams;
  const db = getDb();
  const [landings, campaignRows] = await Promise.all([listLandings(db), listCampaigns(db)]);
  type LandingRow = (typeof landings)[number];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Landings</h1>
      <p
        aria-live="polite"
        role={params.error ? "alert" : "status"}
        className={`text-sm ${params.error ? "text-destructive" : "text-success"}`}
      >
        {params.error ?? params.ok}
      </p>

      <details
        id="nueva-landing"
        open={Boolean(params.l_slug || params.l_title)}
        className="rounded-[var(--radius-card)] border border-border p-4"
      >
        <summary className="cursor-pointer font-medium">Nueva landing</summary>
        <form action={createLanding} className="mt-4 grid gap-4 md:grid-cols-3">
          <Field id="title" label="Título" error={params.l_title}>
            <Input name="title" required />
          </Field>
          <Field id="slug" label="Slug (URL /lp/…)" error={params.l_slug}>
            <Input name="slug" required placeholder="erp-integracion-q4" />
          </Field>
          <Field id="campaignId" label="Campaña">
            <Select name="campaignId" defaultValue="">
              <option value="">Sin campaña</option>
              {campaignRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button type="submit">Crear landing</Button>
          </div>
        </form>
      </details>

      {landings.length === 0 ? (
        <EmptyState title="Aún no hay landings" text="Crea la primera landing de campaña." />
      ) : (
        <Table<LandingRow>
          caption="Landings"
          rows={landings}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "title",
              label: "Título",
              render: (row) => (
                <Link href={`/landings/${row.id}`} className="font-medium text-link">
                  {row.title}
                </Link>
              ),
            },
            {
              key: "slug",
              label: "Slug",
              render: (row) => <span className="font-mono text-sm">/lp/{row.slug}</span>,
            },
            { key: "campaign", label: "Campaña", render: (row) => row.campaignName ?? "—" },
            {
              key: "status",
              label: "Estado",
              render: (row) => (
                <Badge tone={row.status === "publicada" ? "success" : "neutral"}>
                  {statusLabels[row.status]}
                </Badge>
              ),
            },
            {
              key: "publishedAt",
              label: "Publicada el",
              render: (row) => (row.publishedAt ? dateTime.format(row.publishedAt) : "—"),
            },
          ]}
        />
      )}

      <Card title="Campañas">
        <div id="campanas" className="space-y-4">
          {campaignRows.length === 0 ? (
            <p className="text-fg-muted">Sin campañas todavía.</p>
          ) : (
            <ul className="space-y-1">
              {campaignRows.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="font-mono text-sm text-fg-muted">utm_campaign={c.slug}</span> ·{" "}
                  {channelLabels[c.channel] ?? c.channel}
                </li>
              ))}
            </ul>
          )}
          {can(actor, "campaigns.write") ? (
            <form action={newCampaign} className="grid gap-4 md:grid-cols-3">
              <Field id="c-name" label="Nombre de la campaña" error={params.c_name}>
                <Input name="name" required />
              </Field>
              <Field id="c-slug" label="Slug (= utm_campaign)" error={params.c_slug}>
                <Input name="slug" required placeholder="google-erp-q4" />
              </Field>
              <Field id="c-channel" label="Canal">
                <Select name="channel">
                  {Object.entries(channelLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="c-start" label="Inicio">
                <Input name="startsOn" type="date" />
              </Field>
              <Field id="c-end" label="Fin">
                <Input name="endsOn" type="date" />
              </Field>
              <div className="self-end">
                <Button type="submit" variant="ghost">
                  Crear campaña
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
