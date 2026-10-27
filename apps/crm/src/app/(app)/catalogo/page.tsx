import { can } from "@tekinsof/core/auth/permissions";
import {
  listServices,
  type Service,
  serviceCategories,
  serviceUnits,
  setServicePublication,
  upsertService,
} from "@tekinsof/core/catalog/services";
import { getDb } from "@tekinsof/core/db/client";
import { formatAmount, toHundredths } from "@tekinsof/core/sales/quote-math";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Button, Field, Input, Select, Table, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Catálogo" };

const categoryLabels: Record<string, string> = {
  tecnologia: "Tecnología",
  marketing: "Marketing digital",
};
const unitLabels: Record<string, string> = {
  servicio: "Servicio",
  hora: "Hora",
  mes: "Mes",
  licencia: "Licencia",
  proyecto: "Proyecto",
};

type SearchParams = Promise<Record<string, string | undefined>>;
const str = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function back(params: Record<string, string>, hash = ""): never {
  redirect(`/catalogo?${new URLSearchParams(params).toString()}${hash}`);
}

async function create(formData: FormData) {
  "use server";
  const actor = await authorize("catalog.write");
  if (!actor.ok) back({ error: actor.error.message });
  let basePriceCents = 0;
  try {
    basePriceCents = str(formData, "price") ? toHundredths(str(formData, "price")) : 0;
  } catch {
    back({ error: "Datos inválidos", e_price: "Precio inválido" }, "#nuevo");
  }
  const result = await upsertService(getDb(), actor.data, {
    code: str(formData, "code"),
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    category: str(formData, "category") as (typeof serviceCategories)[number],
    unit: str(formData, "unit") as (typeof serviceUnits)[number],
    summary: str(formData, "summary"),
    basePriceCents,
    currency: str(formData, "currency") === "USD" ? "USD" : "PEN",
  });
  if (result.ok) back({ ok: "Servicio creado" });
  const params: Record<string, string> = { error: result.error.message };
  for (const [field, message] of Object.entries(result.error.fields ?? {}))
    params[`e_${field}`] = message;
  back(params, "#nuevo");
}

// One form per row; the pressed button's `op` says what to toggle.
async function toggle(formData: FormData) {
  "use server";
  const actor = await authorize("catalog.write");
  if (!actor.ok) back({ error: actor.error.message });
  const id = str(formData, "id");
  const [service] = (await listServices(getDb())).filter((s) => s.id === id);
  if (!service) back({ error: "Servicio no encontrado" });
  const op = str(formData, "op");
  const result =
    op === "active"
      ? await upsertService(getDb(), actor.data, {
          ...service,
          seoTitle: service.seoTitle ?? undefined,
          seoDescription: service.seoDescription ?? undefined,
          category: service.category as (typeof serviceCategories)[number],
          unit: service.unit as (typeof serviceUnits)[number],
          currency: service.currency as "PEN" | "USD",
          isActive: !service.isActive,
        })
      : await setServicePublication(getDb(), actor.data, id, {
          isPublished: op === "publish" ? !service.isPublished : service.isPublished,
          isFeatured: op === "feature" ? !service.isFeatured : service.isFeatured,
        });
  back(result.ok ? { ok: `${service.name}: guardado` } : { error: result.error.message });
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermissionPage("catalog.read");
  const params = await searchParams;
  const canWrite = can(actor, "catalog.write");
  const all = await listServices(getDb());
  const columns = [
    {
      key: "code",
      label: "Código",
      render: (s: Service) => <span className="font-mono text-sm">{s.code}</span>,
    },
    { key: "name", label: "Nombre", render: (s: Service) => s.name },
    {
      key: "price",
      label: "Precio base",
      numeric: true,
      render: (s: Service) =>
        `${s.currency === "USD" ? "US$" : "S/"} ${formatAmount(s.basePriceCents)}`,
    },
    { key: "unit", label: "Unidad", render: (s: Service) => unitLabels[s.unit] ?? s.unit },
    {
      key: "state",
      label: "Estado",
      render: (s: Service) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={s.isActive ? "success" : "neutral"}>
            {s.isActive ? "Activo" : "Inactivo"}
          </Badge>
          <Badge tone={s.isPublished ? "accent" : "neutral"}>
            {s.isPublished ? "Publicado" : "Oculto"}
          </Badge>
          {s.isFeatured ? <Badge tone="warning">Destacado</Badge> : null}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            label: "Acciones",
            render: (s: Service) => (
              <form action={toggle} className="flex flex-wrap gap-1">
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" name="op" value="active" variant="ghost">
                  {s.isActive ? "Desactivar" : "Activar"}
                </Button>
                <Button type="submit" name="op" value="publish" variant="ghost">
                  {s.isPublished ? "Despublicar" : "Publicar"}
                </Button>
                {s.isPublished ? (
                  <Button type="submit" name="op" value="feature" variant="ghost">
                    {s.isFeatured ? "Quitar de portada" : "Destacar"}
                  </Button>
                ) : null}
              </form>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Catálogo</h1>
      <div aria-live="polite">
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
      </div>

      {canWrite ? (
        <details
          id="nuevo"
          open={Boolean(params.error)}
          className="rounded-[var(--radius-card)] border border-border p-4"
        >
          <summary className="cursor-pointer font-medium">Nuevo servicio</summary>
          <form action={create} className="mt-4 grid gap-4 md:grid-cols-3">
            <Field id="code" label="Código" error={params.e_code}>
              <Input name="code" required placeholder="SW-DEV" />
            </Field>
            <Field id="name" label="Nombre" error={params.e_name}>
              <Input name="name" required />
            </Field>
            <Field id="slug" label="Slug (URL)" error={params.e_slug}>
              <Input name="slug" required placeholder="desarrollo-de-software" />
            </Field>
            <Field id="category" label="Categoría">
              <Select name="category">
                {serviceCategories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="unit" label="Unidad">
              <Select name="unit">
                {serviceUnits.map((u) => (
                  <option key={u} value={u}>
                    {unitLabels[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field id="price" label="Precio base" error={params.e_price}>
                <Input name="price" inputMode="decimal" placeholder="0.00" />
              </Field>
              <Field id="currency" label="Moneda">
                <Select name="currency">
                  <option value="PEN">S/</option>
                  <option value="USD">US$</option>
                </Select>
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field id="summary" label="Resumen (una oración)" error={params.e_summary}>
                <Textarea name="summary" />
              </Field>
            </div>
            <div>
              <Button type="submit">Crear servicio</Button>
            </div>
          </form>
        </details>
      ) : null}

      {serviceCategories.map((category) => {
        const rows = all.filter((s) => s.category === category);
        return (
          <section key={category} className="space-y-3">
            <h2 className="font-display text-xl font-semibold">{categoryLabels[category]}</h2>
            {rows.length === 0 ? (
              <p className="text-fg-muted">Sin servicios en esta categoría.</p>
            ) : (
              <Table
                caption={categoryLabels[category] ?? category}
                rows={rows}
                rowKey={(s) => s.id}
                columns={columns}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
