import { can } from "@tekinsof/core/auth/permissions";
import { createContact, listContacts } from "@tekinsof/core/crm/accounts";
import { getDb } from "@tekinsof/core/db/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, EmptyState, Field, Input, Pagination, Table } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Contactos" };

type SearchParams = Promise<{
  q?: string;
  page?: string;
  ok?: string;
  error?: string;
  field?: string;
}>;

async function create(formData: FormData) {
  "use server";
  const actor = await authorize("accounts.write");
  if (!actor.ok) redirect(`/contactos?error=${encodeURIComponent(actor.error.message)}`);
  const result = await createContact(getDb(), actor.data, {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? ""),
  });
  if (result.ok) redirect("/contactos?ok=Contacto%20creado");
  const params = new URLSearchParams({ error: result.error.message });
  const field = Object.entries(result.error.fields ?? {})[0];
  if (field) params.set("field", `${field[0]}:${field[1]}`);
  redirect(`/contactos?${params.toString()}#nuevo`);
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("accounts.read");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const { rows, pageCount } = await listContacts(getDb(), { q: params.q, page });
  const [fieldName, fieldError] = params.field?.split(":") ?? [];
  const fieldErr = (name: string) => (fieldName === name ? fieldError : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Contactos</h1>
        <search>
          <form className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              Buscar contactos
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              placeholder="Nombre o correo"
              defaultValue={params.q}
            />
            <Button type="submit" variant="ghost">
              Buscar
            </Button>
          </form>
        </search>
      </div>

      {params.ok ? (
        <p role="status" className="text-sm text-success">
          {params.ok}
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="text-sm text-destructive">
          {params.error}
        </p>
      ) : null}

      {can(actor, "accounts.write") ? (
        <details
          id="nuevo"
          open={Boolean(params.error)}
          className="rounded-[var(--radius-card)] border border-border p-4"
        >
          <summary className="cursor-pointer font-medium">Nuevo contacto</summary>
          <form action={create} className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="contact-name" label="Nombre" error={fieldErr("fullName")}>
              <Input name="fullName" required />
            </Field>
            <Field id="contact-job" label="Cargo">
              <Input name="jobTitle" />
            </Field>
            <Field id="contact-email" label="Correo" error={fieldErr("email")}>
              <Input name="email" type="email" />
            </Field>
            <Field id="contact-phone" label="Teléfono" error={fieldErr("phone")}>
              <Input name="phone" type="tel" />
            </Field>
            <div>
              <Button type="submit">Crear contacto</Button>
            </div>
          </form>
        </details>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No hay contactos"
          text={
            params.q ? "Ningún contacto coincide con la búsqueda." : "Registra el primer contacto."
          }
        />
      ) : (
        <Table
          caption="Contactos"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            { key: "fullName", label: "Nombre", render: (row) => row.fullName },
            {
              key: "company",
              label: "Empresa",
              render: (row) =>
                row.companyId ? (
                  <Link
                    href={`/empresas/${row.companyId}`}
                    className="text-link underline-offset-2 hover:underline"
                  >
                    {row.companyName}
                  </Link>
                ) : (
                  "—"
                ),
            },
            { key: "jobTitle", label: "Cargo", render: (row) => row.jobTitle ?? "—" },
            { key: "email", label: "Correo", render: (row) => row.email ?? "—" },
            { key: "phone", label: "Teléfono", render: (row) => row.phone ?? "—" },
          ]}
        />
      )}
      <Pagination page={page} pageCount={pageCount} params={{ q: params.q }} />
    </div>
  );
}
