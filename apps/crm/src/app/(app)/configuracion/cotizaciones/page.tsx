import { getDb } from "@tekinsof/core/db/client";
import {
  type DocumentField,
  documentFields,
  getQuoteDefaults,
  setQuoteDefaults,
} from "@tekinsof/core/sales/quote-document";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { documentFieldLabels } from "@/components/quotes/document-fields";
import { Button, Card, Field, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Textos de cotización" };

const PATH = "/configuracion/cotizaciones";
const fields = documentFieldLabels.filter(
  (field): field is typeof field & { name: DocumentField } =>
    (documentFields as readonly string[]).includes(field.name),
);

async function save(formData: FormData) {
  "use server";
  const back = (key: "ok" | "error", message: string): never =>
    redirect(`${PATH}?${key}=${encodeURIComponent(message)}`);
  const actor = await authorize("settings.manage");
  if (!actor.ok) return back("error", actor.error.message);
  const input = Object.fromEntries(
    documentFields.map((field) => [field, String(formData.get(field) ?? "")]),
  );
  const result = await setQuoteDefaults(getDb(), actor.data, input);
  if (!result.ok) return back("error", result.error.message);
  back("ok", "Textos guardados. Se aplican a las cotizaciones nuevas.");
}

export default async function QuoteDefaultsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermissionPage("settings.manage");
  const query = await searchParams;
  const defaults = await getQuoteDefaults(getDb());

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Textos de cotización</h1>
        <p className="text-fg-muted">
          Cada cotización nueva copia estos textos; el vendedor puede ajustarlos en su borrador.
        </p>
      </div>
      <p
        aria-live="polite"
        role={query.error ? "alert" : "status"}
        className={`text-sm ${query.error ? "text-destructive" : "text-success"}`}
      >
        {query.error ?? query.ok}
      </p>
      <Card title="Mensaje, condiciones y observaciones">
        <form action={save} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(({ name, label, help, wide }) => (
              <div key={name} className={wide ? "sm:col-span-2" : ""}>
                <Field id={name} label={label} help={help}>
                  <Textarea
                    name={name}
                    defaultValue={defaults[name]}
                    rows={wide ? 4 : 2}
                    maxLength={4000}
                  />
                </Field>
              </div>
            ))}
          </div>
          <Button type="submit">Guardar textos</Button>
        </form>
      </Card>
    </div>
  );
}
