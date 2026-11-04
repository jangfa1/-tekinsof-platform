import { can } from "@tekinsof/core/auth/permissions";
import { listServices } from "@tekinsof/core/catalog/services";
import { getDb } from "@tekinsof/core/db/client";
import { formatAmount, sectionSubtotals } from "@tekinsof/core/sales/quote-math";
import { getQuote } from "@tekinsof/core/sales/quote-queries";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentFields } from "@/components/quotes/document-fields";
import { ItemsSection } from "@/components/quotes/items-section";
import { WhatsappShare } from "@/components/quotes/whatsapp-share";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";
import {
  decideQuote,
  quoteLifecycle,
  saveQuote,
  sendQuoteByEmail,
  shareByWhatsapp,
} from "./actions";

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
const SHAREABLE = new Set(["aprobada", "enviada", "aceptada", "rechazada", "vencida"]);
const day = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "short" });
const pdfLink =
  "inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-border px-4 text-sm font-medium hover:bg-surface";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | undefined>>;

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
  const canSend = can(actor, "quotes.send_own", owner);
  const editable = canWrite && quote.status === "borrador";
  const catalog = editable ? await listServices(getDb(), { activeOnly: true }) : [];
  const symbol = quote.currency === "USD" ? "US$" : "S/";
  const money = (value: number) => `${symbol} ${formatAmount(value)}`;
  const { productsCents, servicesCents } = sectionSubtotals(quote.items);

  // Saved rows plus the blank rows asked for in the URL (`p`, `s`); a draft shows one of each.
  const saved = (section: string) => quote.items.filter((item) => item.section === section);
  const rowsFor = (section: string, requested: string | undefined) => {
    const items = saved(section);
    const count = editable ? Math.max(Number(requested) || 0, items.length, 1) : items.length;
    return Array.from({ length: count }, (_, i) => items[i]);
  };
  const productRows = rowsFor("producto", query.p);
  const serviceRows = rowsFor("servicio", query.s);
  const pdfUrl = `/api/cotizaciones/${quote.id}/pdf`;

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
            <dt className="text-sm text-fg-muted">Empresa · RUC</dt>
            <dd>
              {quote.company?.name ?? "—"}
              {quote.company?.ruc ? ` · ${quote.company.ruc}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Contacto</dt>
            <dd>
              {quote.contact?.fullName ?? "—"}
              {quote.contact?.jobTitle ? ` · ${quote.contact.jobTitle}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Moneda · vigencia</dt>
            <dd className="tabular-nums">
              {symbol}
              {quote.currency === "USD" ? ` (S/ ${quote.exchangeRate} por US$ 1)` : ""} ·{" "}
              {quote.validUntil
                ? `hasta ${day.format(new Date(`${quote.validUntil}T00:00:00Z`))}`
                : "se fija al emitir"}
            </dd>
          </div>
        </dl>
      </Card>

      <form action={saveQuote} className="space-y-6">
        <input type="hidden" name="quoteId" value={quote.id} />
        <input type="hidden" name="rows" value={productRows.length + serviceRows.length} />

        <Card title="Productos">
          <div className="space-y-4">
            <ItemsSection
              section="producto"
              rows={productRows}
              firstIndex={0}
              editable={editable}
              catalog={[]}
              money={money}
              subtotalCents={productsCents}
            />
            {editable ? (
              <Button type="submit" name="op" value="add:producto" variant="ghost">
                Agregar producto
              </Button>
            ) : null}
          </div>
        </Card>

        <Card title="Servicios">
          <div className="space-y-4">
            <ItemsSection
              section="servicio"
              rows={serviceRows}
              firstIndex={productRows.length}
              editable={editable}
              catalog={catalog}
              money={money}
              subtotalCents={servicesCents}
            />
            {editable ? (
              <Button type="submit" name="op" value="add:servicio" variant="ghost">
                Agregar servicio
              </Button>
            ) : null}
          </div>
        </Card>

        <Card title="Resumen económico">
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
              <dt>Subtotal productos</dt>
              <dd className="text-right">{money(productsCents)}</dd>
              <dt>Subtotal servicios</dt>
              <dd className="text-right">{money(servicesCents)}</dd>
              <dt>Subtotal general</dt>
              <dd className="text-right">{money(quote.subtotalCents)}</dd>
              <dt>Descuento</dt>
              <dd className="text-right">− {money(quote.discountCents)}</dd>
              <dt>IGV (18%)</dt>
              <dd className="text-right">{money(quote.igvCents)}</dd>
              <dt className="border-t border-border pt-1 font-display text-lg font-bold">Total</dt>
              <dd className="border-t border-border pt-1 text-right font-display text-lg font-bold">
                {money(quote.totalCents)}
              </dd>
            </dl>
          </div>
        </Card>

        <Card title="Condiciones comerciales">
          <DocumentFields texts={quote} editable={editable} />
        </Card>

        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="op" value="save" variant="ghost">
              Guardar
            </Button>
            <Button type="submit" name="op" value="submit">
              Emitir
            </Button>
          </div>
        ) : null}
      </form>

      {SHAREABLE.has(quote.status) && canSend ? (
        <Card title="Enviar al cliente">
          <div className="flex flex-wrap items-start justify-between gap-6">
            {quote.status === "aprobada" ? (
              <form action={sendQuoteByEmail} className="flex flex-wrap items-end gap-4">
                <input type="hidden" name="quoteId" value={quote.id} />
                <div className="min-w-64">
                  <Field
                    id="to"
                    label="Correo del cliente"
                    help="Sale desde tu buzón de Outlook con el PDF adjunto"
                  >
                    <Input
                      name="to"
                      type="email"
                      required
                      defaultValue={quote.contact?.email ?? ""}
                    />
                  </Field>
                </div>
                <Button type="submit">Enviar al cliente</Button>
              </form>
            ) : null}
            <WhatsappShare quoteId={quote.id} pdfUrl={pdfUrl} share={shareByWhatsapp} />
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <a href={pdfUrl} target="_blank" rel="noopener" className={pdfLink}>
          {editable ? "Vista previa PDF" : "Ver PDF"}
        </a>
        <a href={pdfUrl} download className={pdfLink}>
          Descargar PDF
        </a>
        {quote.status === "pendiente_aprobacion" && can(actor, "quotes.approve") ? (
          <form action={decideQuote} className="flex gap-2">
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
          <form action={quoteLifecycle} className="flex flex-wrap gap-2">
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
