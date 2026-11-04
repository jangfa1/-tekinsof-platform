import { can } from "@tekinsof/core/auth/permissions";
import { listServices } from "@tekinsof/core/catalog/services";
import { getDb } from "@tekinsof/core/db/client";
import { createMailer } from "@tekinsof/core/integrations/graph";
import { sendQuote } from "@tekinsof/core/sales/quote-delivery";
import { formatAmount, toHundredths } from "@tekinsof/core/sales/quote-math";
import { getQuote } from "@tekinsof/core/sales/quote-queries";
import {
  approveQuote,
  markQuoteOutcome,
  newQuoteVersion,
  setQuoteItems,
  submitQuote,
} from "@tekinsof/core/sales/quotes";
import { createFileStore } from "@tekinsof/core/storage/files";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Cotización" };

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
const day = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "short" });
const cell = "border-t border-border px-2 py-2 align-top";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | undefined>>;
type Failure = { message: string; fields?: Record<string, string> };

const str = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
// "1500.00" → céntimos; null when blank, NaN when invalid.
const cents = (value: string) => {
  if (!value) return null;
  try {
    return toHundredths(value);
  } catch {
    return Number.NaN;
  }
};

function back(id: string, params: Record<string, string>): never {
  redirect(`/cotizaciones/${id}?${new URLSearchParams(params).toString()}`);
}

function failure(id: string, error: Failure): never {
  const details = Object.entries(error.fields ?? {}).map(([field, message]) => {
    const row = /^items\.(\d+)/.exec(field)?.[1];
    return row === undefined ? message : `Ítem ${Number(row) + 1}: ${message}`;
  });
  back(id, { error: [error.message, ...details].join(" · ") });
}

async function save(formData: FormData) {
  "use server";
  const id = str(formData, "quoteId");
  const op = str(formData, "op");
  const actor = await authorize("quotes.read");
  if (!actor.ok) failure(id, actor.error);
  const items = [];
  for (let i = 0; i < Number(formData.get("rows")); i++) {
    const row = (name: string) => str(formData, `items.${i}.${name}`);
    if (op === `remove:${i}` || !(row("serviceId") || row("description") || row("price"))) continue;
    const unitPriceCents = cents(row("price"));
    if (Number.isNaN(unitPriceCents)) failure(id, { message: `Ítem ${i + 1}: precio inválido` });
    items.push({
      serviceId: row("serviceId"),
      description: row("description"),
      quantity: row("quantity") || "1",
      unitPriceCents: unitPriceCents ?? undefined,
    });
  }
  const saved = await setQuoteItems(getDb(), actor.data, id, {
    discountPct: str(formData, "discountPct") || "0",
    items,
  });
  if (!saved.ok) failure(id, saved.error);
  if (op === "add") back(id, { rows: String(items.length + 1) });
  if (op === "submit") {
    const submitted = await submitQuote(getDb(), actor.data, id);
    if (!submitted.ok) failure(id, submitted.error);
    back(id, { ok: "Cotización emitida" });
  }
  back(id, { ok: "Cambios guardados" });
}

async function send(formData: FormData) {
  "use server";
  const id = str(formData, "quoteId");
  const actor = await authorize("quotes.read");
  if (!actor.ok) failure(id, actor.error);
  const env = getEnv();
  const deps = {
    store: createFileStore({
      driver: env.STORAGE_DRIVER,
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      bucket: "quotes",
    }),
    mailer: createMailer({
      driver: env.MAIL_DRIVER,
      tenantId: env.GRAPH_TENANT_ID,
      clientId: env.GRAPH_CLIENT_ID,
      clientSecret: env.GRAPH_CLIENT_SECRET,
    }),
  };
  const result = await sendQuote(getDb(), deps, actor.data, id, { to: str(formData, "to") });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: `Enviada a ${result.data.to}` });
}

async function decide(formData: FormData) {
  "use server";
  const id = str(formData, "quoteId");
  const actor = await authorize("quotes.approve");
  if (!actor.ok) failure(id, actor.error);
  const decision = str(formData, "decision") === "rechazar" ? "rechazar" : "aprobar";
  const result = await approveQuote(getDb(), actor.data, id, { decision });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: decision === "aprobar" ? "Cotización aprobada" : "Devuelta a borrador" });
}

async function lifecycle(formData: FormData) {
  "use server";
  const id = str(formData, "quoteId");
  const op = str(formData, "op");
  const actor = await authorize("quotes.read");
  if (!actor.ok) failure(id, actor.error);
  if (op === "version") {
    const result = await newQuoteVersion(getDb(), actor.data, id);
    if (!result.ok) failure(id, result.error);
    back(result.data.quoteId, { ok: `Versión ${result.data.version} creada` });
  }
  const outcome = op === "aceptada" ? "aceptada" : "rechazada";
  const result = await markQuoteOutcome(getDb(), actor.data, id, outcome);
  if (!result.ok) failure(id, result.error);
  back(id, { ok: outcome === "aceptada" ? "Marcada como aceptada" : "Marcada como rechazada" });
}

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermissionPage("quotes.read");
  const { id } = await params;
  const query = await searchParams;
  const quote = await getQuote(getDb(), id);
  if (!quote) notFound();
  const owner = { ownerId: quote.ownerId };
  const canWrite = can(actor, "quotes.write_own", owner);
  const editable = canWrite && quote.status === "borrador";
  const catalog = editable ? await listServices(getDb(), { activeOnly: true }) : [];
  const symbol = quote.currency === "USD" ? "US$" : "S/";
  const money = (value: number) => `${symbol} ${formatAmount(value)}`;
  const rowCount = Math.max(Number(query.rows) || 0, quote.items.length, editable ? 1 : 0);
  const rows = Array.from({ length: rowCount }, (_, i) => quote.items[i]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {quote.number} v{quote.version}
        </h1>
        <Badge
          tone={
            quote.status === "pendiente_aprobacion"
              ? "warning"
              : quote.status === "aprobada"
                ? "success"
                : "neutral"
          }
        >
          {statusLabels[quote.status] ?? quote.status}
        </Badge>
      </div>
      <p
        aria-live="polite"
        role={query.error ? "alert" : "status"}
        className={`text-sm ${query.error ? "text-destructive" : "text-success"}`}
      >
        {query.error ?? query.ok}
      </p>

      <Card title="Cliente">
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-fg-muted">Oportunidad</dt>
            <dd>
              <Link href={`/oportunidades/${quote.opportunityId}`} className="text-link">
                {quote.opportunity?.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Empresa</dt>
            <dd>{quote.company?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Moneda · tipo de cambio</dt>
            <dd className="tabular-nums">
              {symbol} · S/ {quote.exchangeRate} por US$ 1
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Vigencia</dt>
            <dd>
              {quote.validUntil
                ? `hasta ${day.format(new Date(`${quote.validUntil}T00:00:00Z`))}`
                : "Se fija al emitir"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Ítems">
        <form action={save} className="space-y-4">
          <input type="hidden" name="quoteId" value={quote.id} />
          <input type="hidden" name="rows" value={rows.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Ítems de la cotización</caption>
              <thead className="bg-surface text-left text-fg-muted">
                <tr>
                  {["Servicio", "Descripción", "Cantidad", "Precio unitario", "Importe", ""].map(
                    (h) => (
                      <th key={h} scope="col" className="px-2 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((item, i) => (
                  <tr key={item?.id ?? `new-${i}`}>
                    <td className={cell}>
                      {editable ? (
                        <>
                          <label
                            htmlFor={`s${i}`}
                            className="sr-only"
                          >{`Servicio del ítem ${i + 1}`}</label>
                          <Select
                            id={`s${i}`}
                            name={`items.${i}.serviceId`}
                            defaultValue={item?.serviceId ?? ""}
                          >
                            <option value="">Concepto libre</option>
                            {catalog.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </Select>
                        </>
                      ) : item?.serviceId ? (
                        "Catálogo"
                      ) : (
                        "Concepto libre"
                      )}
                    </td>
                    {[
                      ["description", "Descripción", item?.description ?? ""],
                      ["quantity", "Cantidad", item?.quantity ?? "1"],
                      [
                        "price",
                        "Precio unitario",
                        item ? formatAmount(item.unitPriceCents).replaceAll(",", "") : "",
                      ],
                    ].map(([name, label, value]) => (
                      <td key={name} className={cell}>
                        {editable ? (
                          <>
                            <label
                              htmlFor={`${name}${i}`}
                              className="sr-only"
                            >{`${label} del ítem ${i + 1}`}</label>
                            <Input
                              id={`${name}${i}`}
                              name={`items.${i}.${name}`}
                              defaultValue={value}
                              inputMode={name === "description" ? "text" : "decimal"}
                            />
                          </>
                        ) : (
                          <span className={name === "description" ? "" : "tabular-nums"}>
                            {value}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={`${cell} text-right tabular-nums`}>
                      {item ? money(item.lineTotalCents) : "—"}
                    </td>
                    <td className={cell}>
                      {editable ? (
                        <Button
                          type="submit"
                          name="op"
                          value={`remove:${i}`}
                          variant="ghost"
                          aria-label={`Quitar ítem ${i + 1}`}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="w-40">
              <Field id="discountPct" label="Descuento %" help="Más de 10% requiere aprobación">
                <Input
                  name="discountPct"
                  inputMode="decimal"
                  defaultValue={quote.discountPct}
                  disabled={!editable}
                />
              </Field>
            </div>
            <dl className="grid min-w-64 grid-cols-2 gap-x-6 gap-y-1 tabular-nums">
              <dt>Subtotal</dt>
              <dd className="text-right">{money(quote.subtotalCents)}</dd>
              <dt>Descuento</dt>
              <dd className="text-right">− {money(quote.discountCents)}</dd>
              <dt>IGV (18%)</dt>
              <dd className="text-right">{money(quote.igvCents)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{money(quote.totalCents)}</dd>
            </dl>
          </div>

          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="op" value="add" variant="ghost">
                Agregar ítem
              </Button>
              <Button type="submit" name="op" value="save" variant="ghost">
                Guardar
              </Button>
              <Button type="submit" name="op" value="submit">
                Emitir
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      {quote.status === "aprobada" && can(actor, "quotes.send_own", owner) ? (
        <Card title="Enviar al cliente">
          <form action={send} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="quoteId" value={quote.id} />
            <div className="min-w-64">
              <Field
                id="to"
                label="Correo del cliente"
                help="Sale desde tu buzón de Outlook con el PDF adjunto"
              >
                <Input name="to" type="email" required defaultValue={quote.contact?.email ?? ""} />
              </Field>
            </div>
            <Button type="submit">Enviar al cliente</Button>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/cotizaciones/${quote.id}/pdf`}
          className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-border px-4 text-sm font-medium hover:bg-surface"
        >
          Descargar PDF
        </a>
        {quote.status === "pendiente_aprobacion" && can(actor, "quotes.approve") ? (
          <form action={decide} className="flex gap-2">
            <input type="hidden" name="quoteId" value={quote.id} />
            <Button type="submit" name="decision" value="aprobar">
              Aprobar
            </Button>
            <Button type="submit" name="decision" value="rechazar" variant="danger">
              Rechazar
            </Button>
          </form>
        ) : null}
        {canWrite ? (
          <form action={lifecycle} className="flex flex-wrap gap-2">
            <input type="hidden" name="quoteId" value={quote.id} />
            {quote.status !== "aceptada" && quote.status !== "reemplazada" ? (
              <Button type="submit" name="op" value="version" variant="ghost">
                Nueva versión
              </Button>
            ) : null}
            {quote.status === "enviada" ? (
              <>
                <Button type="submit" name="op" value="aceptada" variant="ghost">
                  Marcar aceptada
                </Button>
                <Button type="submit" name="op" value="rechazada" variant="ghost">
                  Marcar rechazada
                </Button>
              </>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
