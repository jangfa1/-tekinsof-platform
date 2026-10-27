import { can } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import { listOpportunitiesByStage, openStages } from "@tekinsof/core/sales/opportunities";
import { formatAmount } from "@tekinsof/core/sales/quote-math";
import { createQuote, listQuotes, quoteStatuses } from "@tekinsof/core/sales/quotes";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Table,
} from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Cotizaciones" };

const statusLabels: Record<string, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobación",
  aprobada: "Aprobada",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
  reemplazada: "Reemplazada",
};

const statusTones: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  pendiente_aprobacion: "warning",
  aprobada: "success",
  enviada: "accent",
  aceptada: "success",
  rechazada: "danger",
  vencida: "danger",
};

const day = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "short" });

type SearchParams = Promise<Record<string, string | undefined>>;
type QuoteRow = Awaited<ReturnType<typeof listQuotes>>["rows"][number];

async function create(formData: FormData) {
  "use server";
  const actor = await authorize("quotes.read");
  if (!actor.ok) redirect(`/cotizaciones?error=${encodeURIComponent(actor.error.message)}`);
  const result = await createQuote(getDb(), actor.data, {
    opportunityId: String(formData.get("opportunityId") ?? ""),
    currency: formData.get("currency") === "USD" ? "USD" : "PEN",
    exchangeRate: String(formData.get("exchangeRate") ?? ""),
  });
  if (result.ok) redirect(`/cotizaciones/${result.data.quoteId}`);
  const field = Object.values(result.error.fields ?? {})[0];
  redirect(`/cotizaciones?error=${encodeURIComponent(field ?? result.error.message)}#nueva`);
}

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("quotes.read");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = quoteStatuses.includes(params.estado as never) ? params.estado : undefined;
  const db = getDb();
  const canWrite = can(actor, "quotes.write_own", { ownerId: actor.id });
  const [{ rows, pageCount }, byStage] = await Promise.all([
    listQuotes(db, { status, page }),
    canWrite
      ? listOpportunitiesByStage(db, can(actor, "quotes.write_any") ? {} : { ownerId: actor.id })
      : null,
  ]);
  const openOpportunities = byStage ? openStages.flatMap((stage) => byStage[stage]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Cotizaciones</h1>
        <form className="flex items-end gap-2" aria-label="Filtro de estado">
          <div>
            <label htmlFor="estado" className="block text-sm font-medium">
              Estado
            </label>
            <Select id="estado" name="estado" defaultValue={status ?? ""}>
              <option value="">Todos</option>
              {quoteStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="ghost">
            Filtrar
          </Button>
        </form>
      </div>

      {params.error ? (
        <p role="alert" className="text-sm text-destructive">
          {params.error}
        </p>
      ) : null}

      {canWrite ? (
        <details
          id="nueva"
          open={Boolean(params.error)}
          className="rounded-[var(--radius-card)] border border-border p-4"
        >
          <summary className="cursor-pointer font-medium">Nueva cotización</summary>
          {openOpportunities.length === 0 ? (
            <p className="mt-4 text-fg-muted">
              Primero crea una oportunidad en{" "}
              <Link href="/oportunidades" className="text-link">
                Oportunidades
              </Link>
              .
            </p>
          ) : (
            <form action={create} className="mt-4 grid gap-4 md:grid-cols-3">
              <Field id="opportunityId" label="Oportunidad">
                <Select name="opportunityId" required>
                  {openOpportunities.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                      {o.companyName ? ` · ${o.companyName}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="currency" label="Moneda">
                <Select name="currency" defaultValue="PEN">
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares (US$)</option>
                </Select>
              </Field>
              <Field
                id="exchangeRate"
                label="Tipo de cambio (S/ por US$)"
                help="Vacío = valor por defecto"
              >
                <Input name="exchangeRate" inputMode="decimal" placeholder="3.7500" />
              </Field>
              <div>
                <Button type="submit">Crear cotización</Button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Aún no hay cotizaciones"
          text="Crea una desde una oportunidad abierta."
        />
      ) : (
        <Table<QuoteRow>
          caption="Cotizaciones"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "number",
              label: "Número",
              render: (row) => (
                <Link href={`/cotizaciones/${row.id}`} className="font-medium text-link">
                  {row.number} v{row.version}
                </Link>
              ),
            },
            {
              key: "client",
              label: "Cliente",
              render: (row) => row.companyName ?? row.opportunityTitle,
            },
            {
              key: "total",
              label: "Total",
              numeric: true,
              render: (row) =>
                `${row.currency === "USD" ? "US$" : "S/"} ${formatAmount(row.totalCents)}`,
            },
            {
              key: "status",
              label: "Estado",
              render: (row) => (
                <Badge tone={statusTones[row.status] ?? "neutral"}>
                  {statusLabels[row.status]}
                </Badge>
              ),
            },
            {
              key: "validUntil",
              label: "Vigencia",
              render: (row) =>
                row.validUntil ? day.format(new Date(`${row.validUntil}T00:00:00Z`)) : "—",
            },
          ]}
        />
      )}
      <Pagination page={page} pageCount={pageCount} params={{ estado: status }} />
    </div>
  );
}
