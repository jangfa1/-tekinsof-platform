import { can } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import { companies } from "@tekinsof/core/db/schema";
import { listLeads } from "@tekinsof/core/leads/leads";
import {
  createOpportunity,
  listOpportunitiesByStage,
  moveOpportunity,
  openStages,
} from "@tekinsof/core/sales/opportunities";
import { asc, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type BoardColumns, PipelineBoard } from "@/components/pipeline-board";
import { Button, Field, Input, Select } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Oportunidades" };

type SearchParams = Promise<Record<string, string | undefined>>;

// "1500.5" → 150050 céntimos without floating point (quote-math.ts brings toHundredths in step 14).
function decimalToCents(value: string): number | null {
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

async function moveAction(input: { opportunityId: string; toStage: string; toPosition: number }) {
  "use server";
  const actor = await authorize("opportunities.read");
  if (!actor.ok) return actor;
  const result = await moveOpportunity(
    getDb(),
    actor.data,
    input as Parameters<typeof moveOpportunity>[2],
  );
  if (result.ok) revalidatePath("/oportunidades");
  return result.ok ? { ok: true as const } : result;
}

async function create(formData: FormData) {
  "use server";
  const actor = await authorize("opportunities.read");
  if (!actor.ok) redirect(`/oportunidades?error=${encodeURIComponent(actor.error.message)}`);
  const amount = String(formData.get("amount") ?? "").trim();
  const amountCents = amount ? decimalToCents(amount) : 0;
  if (amountCents === null) redirect("/oportunidades?e_amount=Monto%20inv%C3%A1lido#nueva");
  const result = await createOpportunity(getDb(), actor.data, {
    title: String(formData.get("title") ?? ""),
    companyId: String(formData.get("companyId") ?? ""),
    leadId: String(formData.get("leadId") ?? ""),
    amountCents,
    currency: String(formData.get("currency") ?? "PEN") as "PEN" | "USD",
  });
  if (result.ok) redirect(`/oportunidades/${result.data.opportunityId}`);
  const params = new URLSearchParams({ error: result.error.message });
  for (const [field, message] of Object.entries(result.error.fields ?? {}))
    params.set(`e_${field}`, message);
  redirect(`/oportunidades?${params.toString()}#nueva`);
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("opportunities.read");
  const params = await searchParams;
  const mine = params.ver === "mias";
  const db = getDb();
  const canWrite = can(actor, "opportunities.write_own", { ownerId: actor.id });
  const [byStage, companyRows, qualified] = await Promise.all([
    listOpportunitiesByStage(db, mine ? { ownerId: actor.id } : {}),
    canWrite
      ? db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(isNull(companies.deletedAt))
          .orderBy(asc(companies.name))
      : [],
    canWrite
      ? listLeads(db, {
          status: "calificado",
          ownerId: can(actor, "leads.update_any") ? undefined : actor.id,
        })
      : { rows: [] },
  ]);
  const columns = Object.fromEntries(
    openStages.map((stage) => [
      stage,
      byStage[stage].map(({ id, title, companyName, ownerName, amountCents, currency }) => ({
        id,
        title,
        companyName,
        ownerName,
        amountCents,
        currency,
      })),
    ]),
  ) as BoardColumns;
  const tab = (active: boolean) =>
    `rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium ${active ? "bg-primary text-primary-fg" : "border border-border"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Oportunidades</h1>
        <nav aria-label="Filtro de dueño" className="flex gap-2">
          <Link
            href="/oportunidades?ver=mias"
            className={tab(mine)}
            aria-current={mine ? "page" : undefined}
          >
            Mías
          </Link>
          <Link
            href="/oportunidades"
            className={tab(!mine)}
            aria-current={mine ? undefined : "page"}
          >
            Todas
          </Link>
        </nav>
      </div>

      {params.error ? (
        <p role="alert" className="text-sm text-destructive">
          {params.error}
        </p>
      ) : null}

      {canWrite ? (
        <details
          id="nueva"
          open={Boolean(params.error || params.e_amount)}
          className="rounded-[var(--radius-card)] border border-border p-4"
        >
          <summary className="cursor-pointer font-medium">Nueva oportunidad</summary>
          <form action={create} className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="title" label="Título" error={params.e_title}>
              <Input name="title" required />
            </Field>
            <Field
              id="leadId"
              label="Lead calificado (opcional)"
              help="Convierte el lead en esta oportunidad"
            >
              <Select name="leadId" defaultValue="">
                <option value="">Ninguno</option>
                {qualified.rows.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.fullName}
                    {lead.companyName ? ` · ${lead.companyName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="companyId" label="Empresa">
              <Select name="companyId" defaultValue="">
                <option value="">Sin empresa</option>
                {companyRows.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field id="amount" label="Monto estimado" error={params.e_amount}>
                <Input name="amount" inputMode="decimal" placeholder="0.00" />
              </Field>
              <Field id="currency" label="Moneda">
                <Select name="currency" defaultValue="PEN">
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares (US$)</option>
                </Select>
              </Field>
            </div>
            <div>
              <Button type="submit">Crear oportunidad</Button>
            </div>
          </form>
        </details>
      ) : null}

      <PipelineBoard columns={columns} moveAction={moveAction} />
    </div>
  );
}
