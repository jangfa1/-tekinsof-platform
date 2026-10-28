import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  type TextProps,
  View,
} from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createElement as h, type ReactElement } from "react";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { appSettings, quotes } from "../db/schema.ts";
import { escapeHtml, type Mailer } from "../integrations/graph.ts";
import { err, ok, type Result } from "../result.ts";
import type { FileStore } from "../storage/files.ts";
import { formatAmount } from "./quote-math.ts";
import { getQuote, markQuoteSent } from "./quotes.ts";

// The quote PDF is built with createElement (no JSX in core) and the PDF's built-in Helvetica,
// so rendering never downloads a font.

export type CompanyProfile = {
  legalName: string;
  ruc: string;
  address: string;
  email: string;
  phone: string;
};
type QuoteData = NonNullable<Awaited<ReturnType<typeof getQuote>>>;
export type QuotePdfData = QuoteData & { issuer: CompanyProfile };

const INK = "#1E2126";
const CORAL = "#FF7F5C";
const MUTED = "#5B606B";
const BORDER = "#E2E3E7";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: INK },
  bar: { height: 6, backgroundColor: CORAL, marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: MUTED },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  block: { width: "48%" },
  heading: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  tableHead: {
    flexDirection: "row",
    borderBottom: `1 solid ${INK}`,
    paddingBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${BORDER}`, paddingVertical: 4 },
  description: { width: "52%" },
  number: { width: "16%", textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { fontFamily: "Helvetica-Bold", borderTop: `1 solid ${INK}`, marginTop: 4, paddingTop: 4 },
  section: { marginTop: 16 },
});

type PdfStyle = NonNullable<TextProps["style"]>;
const text = (style: PdfStyle, value: string) => h(Text, { style } as TextProps, value);
const dayFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function quoteDocument(data: QuotePdfData): ReactElement {
  const symbol = data.currency === "USD" ? "US$" : "S/";
  const money = (cents: number) => `${symbol} ${formatAmount(cents)}`;
  const { issuer } = data;
  const totalRow = (label: string, value: string, grand = false) =>
    h(
      View,
      { style: grand ? [styles.totalRow, styles.grand] : styles.totalRow },
      text({}, label),
      text({}, value),
    );
  const discount =
    Number.parseFloat(data.discountPct) === 0 ? "0" : data.discountPct.replace(/\.?0+$/, "");

  return h(
    Document,
    { title: `${data.number} v${data.version}`, author: issuer.legalName },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(View, { style: styles.bar }),
      text(styles.title, `COTIZACIÓN ${data.number} v${data.version}`),
      data.validUntil
        ? text(
            styles.muted,
            `Válida hasta ${dayFormat.format(new Date(`${data.validUntil}T00:00:00Z`))}`,
          )
        : null,
      h(
        View,
        { style: [styles.row, { marginTop: 16 }] },
        h(
          View,
          { style: styles.block },
          text(styles.heading, issuer.legalName),
          issuer.ruc ? text({}, `RUC ${issuer.ruc}`) : null,
          text({}, issuer.address),
          text({}, `${issuer.email} · ${issuer.phone}`),
        ),
        h(
          View,
          { style: styles.block },
          text(styles.heading, "Cliente"),
          text({}, data.company?.name ?? data.opportunity?.title ?? ""),
          data.company?.ruc ? text({}, `RUC ${data.company.ruc}`) : null,
          data.contact
            ? text({}, [data.contact.fullName, data.contact.email].filter(Boolean).join(" · "))
            : null,
        ),
      ),
      h(
        View,
        { style: styles.tableHead },
        text(styles.description, "Descripción"),
        text(styles.number, "Cantidad"),
        text(styles.number, "P. unitario"),
        text(styles.number, "Importe"),
      ),
      ...data.items.map((item) =>
        h(
          View,
          { key: item.id, style: styles.tableRow },
          text(styles.description, item.description),
          text(styles.number, item.quantity),
          text(styles.number, money(item.unitPriceCents)),
          text(styles.number, money(item.lineTotalCents)),
        ),
      ),
      h(
        View,
        { style: styles.totals },
        totalRow("Subtotal", money(data.subtotalCents)),
        totalRow(`Descuento (${discount}%)`, `- ${money(data.discountCents)}`),
        totalRow("IGV (18%)", money(data.igvCents)),
        totalRow("Total", money(data.totalCents), true),
      ),
      data.currency === "USD"
        ? text(
            [styles.section, styles.muted],
            `Tipo de cambio referencial: S/ ${data.exchangeRate} por US$ 1`,
          )
        : null,
      data.notes
        ? h(View, { style: styles.section }, text(styles.heading, "Notas"), text({}, data.notes))
        : null,
      data.terms
        ? h(View, { style: styles.section }, text(styles.heading, "Términos"), text({}, data.terms))
        : null,
      h(
        View,
        { style: styles.section },
        text({}, "Atentamente,"),
        text(styles.heading, data.owner?.name ?? issuer.legalName),
        text(styles.muted, data.owner?.email ?? issuer.email),
      ),
    ),
  );
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  // biome-ignore lint/suspicious/noExplicitAny: react-pdf types renderToBuffer for its Document element only
  return new Uint8Array(await renderToBuffer(quoteDocument(data) as any));
}

const defaultProfile: CompanyProfile = {
  legalName: "Tekinsof Consulting",
  ruc: "",
  address: "Av. La Molina 145, Ate, Lima",
  email: "info@tekinsof.com",
  phone: "+51 981 053 022",
};

async function loadPdfData(db: DbOrTx, quoteId: string): Promise<QuotePdfData | null> {
  const quote = await getQuote(db, quoteId);
  if (!quote) return null;
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "company_profile"));
  return {
    ...quote,
    issuer: { ...defaultProfile, ...((setting?.value as Partial<CompanyProfile>) ?? {}) },
  };
}

export const pdfFileName = (quote: { number: string; version: number }) =>
  `${quote.number}-v${quote.version}.pdf`;

// Sent and later states are frozen: their stored PDF is reused. Drafts are re-rendered on demand.
const FROZEN = new Set(["enviada", "aceptada", "rechazada", "vencida"]);

export async function ensureQuotePdf(
  db: DbOrTx,
  deps: { store: FileStore },
  quoteId: string,
): Promise<Result<{ bytes: Uint8Array; path: string; fileName: string }>> {
  const data = await loadPdfData(db, quoteId);
  if (!data) return err("NOT_FOUND", "Cotización no encontrada");
  const fileName = pdfFileName(data);
  const path = `quotes/${fileName}`;
  if (data.pdfPath && FROZEN.has(data.status)) {
    const stored = await deps.store.get(fileName);
    if (stored.ok) return ok({ bytes: stored.data, path, fileName });
  }
  const bytes = await renderQuotePdf(data);
  const saved = await deps.store.put(fileName, bytes, "application/pdf");
  if (!saved.ok) return saved;
  await db.update(quotes).set({ pdfPath: path }).where(eq(quotes.id, quoteId));
  return ok({ bytes, path, fileName });
}

export async function sendQuote(
  db: DbOrTx,
  deps: { store: FileStore; mailer: Mailer },
  actor: Actor,
  quoteId: string,
  input: { to?: string } = {},
): Promise<Result<{ quoteId: string; to: string }>> {
  const quote = await getQuote(db, quoteId);
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  if (!can(actor, "quotes.send_own", { ownerId: quote.ownerId }))
    return err("FORBIDDEN", "Sin permiso");
  if (quote.status === "pendiente_aprobacion" || quote.status === "borrador") {
    return err("APPROVAL_REQUIRED", "La cotización debe estar aprobada antes de enviarse");
  }
  if (quote.status !== "aprobada")
    return err("INVALID_TRANSITION", "Esta cotización ya fue enviada o cerrada");
  const to = input.to?.trim() || quote.contact?.email;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return err("VALIDATION_ERROR", "Datos inválidos", { to: "Indica el correo del cliente" });
  }
  const owner = quote.owner;
  if (!owner) return err("INTERNAL", "La cotización no tiene dueño");

  const pdf = await ensureQuotePdf(db, deps, quoteId);
  if (!pdf.ok) return pdf;
  const greeting = quote.contact?.fullName
    ? `Hola ${escapeHtml(quote.contact.fullName)}:`
    : "Hola:";
  const sent = await deps.mailer.send({
    from: owner.email,
    to: [to],
    replyTo: owner.email,
    subject: `Cotización ${quote.number} — Tekinsof`,
    html: [
      `<p>${greeting}</p>`,
      `<p>Te enviamos adjunta la cotización ${escapeHtml(quote.number)} (versión ${quote.version}).</p>`,
      "<p>Quedamos atentos a tus comentarios.</p>",
      `<p>Saludos,<br>${escapeHtml(owner.name)}<br>Tekinsof Consulting</p>`,
    ].join(""),
    attachments: [
      {
        name: pdf.data.fileName,
        contentType: "application/pdf",
        contentBase64: Buffer.from(pdf.data.bytes).toString("base64"),
      },
    ],
  });
  if (!sent.ok) return sent;
  const marked = await db.transaction((tx) =>
    markQuoteSent(tx, quoteId, { pdfPath: pdf.data.path }),
  );
  if (!marked.ok) return marked;
  return ok({ quoteId, to });
}
