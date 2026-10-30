import { getDb } from "@tekinsof/core/db/client";
import { type LeadFilters, listLeads } from "@tekinsof/core/leads/leads";
import { leadStatuses } from "@tekinsof/core/leads/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, Pagination, Select, Table } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Leads" };

const sourceLabels: Record<string, string> = {
  web_form: "Formulario web",
  landing: "Landing",
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Manual",
  event: "Evento",
  other: "Otro",
};

const statusLabels: Record<string, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  calificado: "Calificado",
  descartado: "Descartado",
  convertido: "Convertido",
};

const statusTones = {
  nuevo: "accent",
  contactado: "neutral",
  calificado: "success",
  descartado: "danger",
  convertido: "success",
} as const;

const dateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "short",
  timeStyle: "short",
});

type SearchParams = Promise<{ estado?: string; dueno?: string; origen?: string; page?: string }>;

type LeadRow = Awaited<ReturnType<typeof listLeads>>["rows"][number];

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("leads.read");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const filters: LeadFilters = {
    status: leadStatuses.includes(params.estado as never) ? params.estado : undefined,
    ownerId: params.dueno === "mios" ? actor.id : undefined,
    source: params.origen && params.origen in sourceLabels ? params.origen : undefined,
    page,
  };
  const { rows, pageCount } = await listLeads(getDb(), filters);
  const filtered = Boolean(filters.status || filters.ownerId || filters.source);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Leads</h1>
        <Link
          href="/leads/nuevo"
          className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
        >
          Registrar lead
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" aria-label="Filtros">
        <div>
          <label htmlFor="estado" className="block text-sm font-medium">
            Estado
          </label>
          <Select id="estado" name="estado" defaultValue={params.estado ?? ""}>
            <option value="">Todos</option>
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="dueno" className="block text-sm font-medium">
            Dueño
          </label>
          <Select id="dueno" name="dueno" defaultValue={params.dueno ?? "todos"}>
            <option value="todos">Todos</option>
            <option value="mios">Mis leads</option>
          </Select>
        </div>
        <div>
          <label htmlFor="origen" className="block text-sm font-medium">
            Origen
          </label>
          <Select id="origen" name="origen" defaultValue={params.origen ?? ""}>
            <option value="">Todos</option>
            {Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="ghost">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "Ningún lead coincide con los filtros" : "Aún no hay leads"}
          text="Los leads del sitio, las landings y WhatsApp aparecen aquí."
        />
      ) : (
        <Table<LeadRow>
          caption="Leads"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              label: "Nombre",
              render: (row) => (
                <Link
                  href={`/leads/${row.id}`}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {row.fullName}
                </Link>
              ),
            },
            { key: "company", label: "Empresa", render: (row) => row.companyName ?? "—" },
            {
              key: "source",
              label: "Origen",
              render: (row) => {
                const campaign = row.campaignName ?? row.utmCampaign;
                return (
                  <span>
                    {sourceLabels[row.source] ?? row.source}
                    {campaign ? <span className="block text-fg-muted">{campaign}</span> : null}
                  </span>
                );
              },
            },
            {
              key: "status",
              label: "Estado",
              render: (row) => (
                <span className="flex flex-wrap gap-1">
                  <Badge tone={statusTones[row.status as keyof typeof statusTones] ?? "neutral"}>
                    {statusLabels[row.status] ?? row.status}
                  </Badge>
                  {row.slaAlertedAt && !row.firstContactedAt ? (
                    <Badge tone="danger">SLA vencido</Badge>
                  ) : null}
                </span>
              ),
            },
            { key: "owner", label: "Dueño", render: (row) => row.ownerName ?? "Sin asignar" },
            {
              key: "createdAt",
              label: "Fecha",
              render: (row) => (
                <span className="tabular-nums">{dateTime.format(row.createdAt)}</span>
              ),
            },
          ]}
        />
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        params={{ estado: params.estado, dueno: params.dueno, origen: params.origen }}
      />
    </div>
  );
}
