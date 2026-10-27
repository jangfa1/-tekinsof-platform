import { can } from "@tekinsof/core/auth/permissions";
import { createCompany, listCompanies } from "@tekinsof/core/crm/accounts";
import { getDb } from "@tekinsof/core/db/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, EmptyState, Field, Input, Pagination, Table } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Empresas" };

type SearchParams = Promise<{ q?: string; page?: string; error?: string; field?: string }>;

async function create(formData: FormData) {
  "use server";
  const actor = await authorize("accounts.write");
  if (!actor.ok) redirect(`/empresas?error=${encodeURIComponent(actor.error.message)}`);
  const result = await createCompany(getDb(), actor.data, {
    name: String(formData.get("name") ?? ""),
    ruc: String(formData.get("ruc") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (result.ok) redirect(`/empresas/${result.data.companyId}`);
  const params = new URLSearchParams({ error: result.error.message });
  const field = Object.entries(result.error.fields ?? {})[0];
  if (field) params.set("field", `${field[0]}:${field[1]}`);
  redirect(`/empresas?${params.toString()}#nueva`);
}

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("accounts.read");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const { rows, pageCount } = await listCompanies(getDb(), { q: params.q, page });
  const [fieldName, fieldError] = params.field?.split(":") ?? [];
  const canWrite = can(actor, "accounts.write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Empresas</h1>
        <search>
          <form className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              Buscar empresas
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              placeholder="Nombre o RUC"
              defaultValue={params.q}
            />
            <Button type="submit" variant="ghost">
              Buscar
            </Button>
          </form>
        </search>
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
          <summary className="cursor-pointer font-medium">Nueva empresa</summary>
          <form action={create} className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              id="company-name"
              label="Razón social"
              error={fieldName === "name" ? fieldError : undefined}
            >
              <Input name="name" required />
            </Field>
            <Field
              id="company-ruc"
              label="RUC"
              help="11 dígitos"
              error={fieldName === "ruc" ? fieldError : undefined}
            >
              <Input name="ruc" inputMode="numeric" />
            </Field>
            <Field id="company-industry" label="Rubro">
              <Input name="industry" />
            </Field>
            <Field id="company-phone" label="Teléfono">
              <Input name="phone" type="tel" />
            </Field>
            <div>
              <Button type="submit">Crear empresa</Button>
            </div>
          </form>
        </details>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No hay empresas"
          text={
            params.q ? "Ninguna empresa coincide con la búsqueda." : "Registra la primera empresa."
          }
        />
      ) : (
        <Table
          caption="Empresas"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              label: "Razón social",
              render: (row) => (
                <Link
                  href={`/empresas/${row.id}`}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            {
              key: "ruc",
              label: "RUC",
              render: (row) => <span className="tabular-nums">{row.ruc ?? "—"}</span>,
            },
            { key: "industry", label: "Rubro", render: (row) => row.industry ?? "—" },
            { key: "phone", label: "Teléfono", render: (row) => row.phone ?? "—" },
          ]}
        />
      )}
      <Pagination page={page} pageCount={pageCount} params={{ q: params.q }} />
    </div>
  );
}
