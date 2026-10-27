import { getDb } from "@tekinsof/core/db/client";
import { services } from "@tekinsof/core/db/schema";
import { createManualLead, manualSources } from "@tekinsof/core/leads/leads";
import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Registrar lead" };

const sourceLabels: Record<(typeof manualSources)[number], string> = {
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Manual",
  event: "Evento",
  other: "Otro",
};

const fieldNames = ["fullName", "phone", "serviceInterest", "email", "companyName", "message"];

type SearchParams = Promise<Record<string, string | undefined>>;

// Values come back in the URL on error so the form keeps what the user typed without JavaScript.
async function create(formData: FormData) {
  "use server";
  const values = Object.fromEntries(
    [...fieldNames, "source"].map((name) => [name, String(formData.get(name) ?? "")]),
  );
  const actor = await authorize("leads.create");
  if (!actor.ok) redirect(`/leads/nuevo?error=${encodeURIComponent(actor.error.message)}`);
  const result = await createManualLead(getDb(), actor.data, {
    ...values,
    fullName: values.fullName ?? "",
  });
  if (result.ok) redirect(`/leads/${result.data.leadId}`);
  const params = new URLSearchParams(values);
  params.set("error", result.error.message);
  for (const [field, message] of Object.entries(result.error.fields ?? {})) {
    params.set(`e_${field}`, message);
  }
  redirect(`/leads/nuevo?${params.toString()}`);
}

export default async function NewLeadPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermissionPage("leads.create");
  const params = await searchParams;
  const activeServices = await getDb()
    .select({ slug: services.slug, name: services.name })
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder), asc(services.name));
  const moreOpen = Boolean(params.e_email || params.email || params.companyName || params.message);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Registrar lead</h1>
      <p className="text-fg-muted">
        Para prospectos que escriben por WhatsApp, llaman o llegan por referencia.
      </p>

      <div aria-live="polite">
        {params.error ? (
          <p role="alert" className="text-sm text-destructive">
            {params.error}
          </p>
        ) : null}
      </div>

      <form action={create} className="space-y-4">
        <Field id="fullName" label="Nombre" error={params.e_fullName}>
          <Input name="fullName" required autoComplete="off" defaultValue={params.fullName} />
        </Field>
        <Field
          id="phone"
          label="Teléfono"
          help="9 dígitos, p. ej. 987 654 321"
          error={params.e_phone}
        >
          <Input name="phone" type="tel" inputMode="tel" defaultValue={params.phone} />
        </Field>
        <Field id="serviceInterest" label="Servicio de interés" error={params.e_serviceInterest}>
          <Select name="serviceInterest" defaultValue={params.serviceInterest ?? ""}>
            <option value="">Sin especificar</option>
            {activeServices.map((service) => (
              <option key={service.slug} value={service.slug}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>

        <details open={moreOpen} className="rounded-[var(--radius-card)] border border-border p-4">
          <summary className="cursor-pointer font-medium">Más datos</summary>
          <div className="mt-4 space-y-4">
            <Field id="email" label="Correo" error={params.e_email}>
              <Input name="email" type="email" defaultValue={params.email} />
            </Field>
            <Field id="companyName" label="Empresa">
              <Input name="companyName" defaultValue={params.companyName} />
            </Field>
            <Field id="message" label="Mensaje">
              <Textarea name="message" defaultValue={params.message} />
            </Field>
            <Field id="source" label="Origen">
              <Select name="source" defaultValue={params.source || "whatsapp"}>
                {manualSources.map((source) => (
                  <option key={source} value={source}>
                    {sourceLabels[source]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </details>

        <Button type="submit" className="w-full sm:w-auto">
          Registrar lead
        </Button>
      </form>
    </div>
  );
}
