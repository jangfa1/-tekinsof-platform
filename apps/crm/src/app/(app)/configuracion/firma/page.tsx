import { getDb } from "@tekinsof/core/db/client";
import { getUserSignature, updateUserSignature } from "@tekinsof/core/sales/quote-document";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Card, Field, Input } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Mi firma" };

const PATH = "/configuracion/firma";

async function save(formData: FormData) {
  "use server";
  const back = (params: Record<string, string>): never =>
    redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
  const actor = await authorize("quotes.read");
  if (!actor.ok) return back({ error: actor.error.message });
  const result = await updateUserSignature(getDb(), actor.data, actor.data.id, {
    jobTitle: String(formData.get("jobTitle") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!result.ok) {
    return back({ error: result.error.message, ...(result.error.fields ?? {}) });
  }
  back({ ok: "Firma guardada" });
}

export default async function SignaturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePermissionPage("quotes.read");
  const query = await searchParams;
  const signature = await getUserSignature(getDb(), actor.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Mi firma</h1>
        <p className="text-fg-muted">
          Aparece al pie de las cotizaciones que emites, junto a tu nombre y correo.
        </p>
      </div>
      <p
        aria-live="polite"
        role={query.error ? "alert" : "status"}
        className={`text-sm ${query.error ? "text-destructive" : "text-success"}`}
      >
        {query.error ?? query.ok}
      </p>
      <Card title="Datos de la firma">
        <form action={save} className="max-w-md space-y-4">
          <p className="text-sm">
            <span className="text-fg-muted">Nombre: </span>
            {actor.name} · <span className="text-fg-muted">Correo: </span>
            {actor.email}
          </p>
          <Field id="jobTitle" label="Cargo" help="Por ejemplo: Ejecutiva comercial">
            <Input name="jobTitle" defaultValue={signature?.jobTitle ?? ""} maxLength={120} />
          </Field>
          <Field
            id="phone"
            label="Teléfono"
            help="Si lo dejas vacío se usa el teléfono general de Tekinsof"
            error={query.phone}
          >
            <Input name="phone" type="tel" defaultValue={signature?.phone ?? ""} maxLength={20} />
          </Field>
          <Button type="submit">Guardar firma</Button>
        </form>
      </Card>
    </div>
  );
}
