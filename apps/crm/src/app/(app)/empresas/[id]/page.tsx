import { can } from "@tekinsof/core/auth/permissions";
import { createContact, getCompany, updateCompany } from "@tekinsof/core/crm/accounts";
import { getDb } from "@tekinsof/core/db/client";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Card, EmptyState, Field, Input, Table } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Empresa" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string; error?: string; field?: string }>;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function back(id: string, params: Record<string, string>): never {
  redirect(`/empresas/${id}?${new URLSearchParams(params).toString()}`);
}

function failure(id: string, error: { message: string; fields?: Record<string, string> }): never {
  const field = Object.entries(error.fields ?? {})[0];
  back(
    id,
    field ? { error: error.message, field: `${field[0]}:${field[1]}` } : { error: error.message },
  );
}

async function update(formData: FormData) {
  "use server";
  const id = text(formData, "id");
  const actor = await authorize("accounts.write");
  if (!actor.ok) failure(id, actor.error);
  const result = await updateCompany(getDb(), actor.data, id, {
    name: text(formData, "name"),
    ruc: text(formData, "ruc"),
    industry: text(formData, "industry"),
    website: text(formData, "website"),
    phone: text(formData, "phone"),
    address: text(formData, "address"),
  });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: "Empresa actualizada" });
}

async function addContact(formData: FormData) {
  "use server";
  const id = text(formData, "companyId");
  const actor = await authorize("accounts.write");
  if (!actor.ok) failure(id, actor.error);
  const result = await createContact(getDb(), actor.data, {
    companyId: id,
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    jobTitle: text(formData, "jobTitle"),
  });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: "Contacto agregado" });
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermissionPage("accounts.read");
  const { id } = await params;
  const query = await searchParams;
  const company = await getCompany(getDb(), id);
  if (!company) notFound();
  const canWrite = can(actor, "accounts.write");
  const [fieldName, fieldError] = query.field?.split(":") ?? [];
  const fieldErr = (name: string) => (fieldName === name ? fieldError : undefined);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{company.name}</h1>
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

      <Card title="Datos">
        <form action={update} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={company.id} />
          <fieldset disabled={!canWrite} className="contents">
            <Field id="name" label="Razón social" error={fieldErr("name")}>
              <Input name="name" defaultValue={company.name} required />
            </Field>
            <Field id="ruc" label="RUC" error={fieldErr("ruc")}>
              <Input name="ruc" defaultValue={company.ruc ?? ""} inputMode="numeric" />
            </Field>
            <Field id="industry" label="Rubro">
              <Input name="industry" defaultValue={company.industry ?? ""} />
            </Field>
            <Field id="website" label="Sitio web">
              <Input name="website" defaultValue={company.website ?? ""} />
            </Field>
            <Field id="phone" label="Teléfono">
              <Input name="phone" type="tel" defaultValue={company.phone ?? ""} />
            </Field>
            <Field id="address" label="Dirección">
              <Input name="address" defaultValue={company.address ?? ""} />
            </Field>
          </fieldset>
          {canWrite ? (
            <div>
              <Button type="submit">Guardar cambios</Button>
            </div>
          ) : null}
        </form>
      </Card>

      <Card title="Contactos">
        {company.contacts.length === 0 ? (
          <EmptyState title="Sin contactos" text="Agrega a la persona con quien conversas." />
        ) : (
          <Table
            caption="Contactos de la empresa"
            rows={company.contacts}
            rowKey={(row) => row.id}
            columns={[
              { key: "fullName", label: "Nombre", render: (row) => row.fullName },
              { key: "jobTitle", label: "Cargo", render: (row) => row.jobTitle ?? "—" },
              { key: "email", label: "Correo", render: (row) => row.email ?? "—" },
              { key: "phone", label: "Teléfono", render: (row) => row.phone ?? "—" },
            ]}
          />
        )}
        {canWrite ? (
          <form action={addContact} className="mt-6 grid gap-4 md:grid-cols-2">
            <h3 className="font-display text-lg font-semibold md:col-span-2">Agregar contacto</h3>
            <input type="hidden" name="companyId" value={company.id} />
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
              <Button type="submit">Agregar contacto</Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card title="Oportunidades abiertas">
        {company.openOpportunities.length === 0 ? (
          <EmptyState
            title="Sin oportunidades abiertas"
            text="Las oportunidades de esta empresa aparecerán aquí."
          />
        ) : (
          <ul className="space-y-2">
            {company.openOpportunities.map((opportunity) => (
              <li key={opportunity.id} className="flex items-center gap-3">
                <span>{opportunity.title}</span>
                <Badge>{opportunity.stage}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
