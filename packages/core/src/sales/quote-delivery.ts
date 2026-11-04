import { eq } from "drizzle-orm";
import { type Actor, can } from "../auth/permissions.ts";
import { company } from "../company.ts";
import type { DbOrTx } from "../db/client.ts";
import { appSettings, quotes } from "../db/schema.ts";
import { escapeHtml, type Mailer } from "../integrations/graph.ts";
import { err, ok, type Result } from "../result.ts";
import type { FileStore } from "../storage/files.ts";
import { limaDate } from "../time/business-hours.ts";
import { renderQuotePdf } from "./quote-pdf/document.ts";
import type { CompanyProfile, QuotePdfData } from "./quote-pdf/theme.ts";
import { getQuote } from "./quote-queries.ts";
import { markQuoteSent } from "./quotes.ts";

// Stores and sends the quote PDF (rendered by ./quote-pdf/).

const defaultProfile: CompanyProfile = {
  legalName: company.legalName,
  ruc: "",
  address: company.address,
  email: company.email,
  phone: company.phone,
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
    today: limaDate(new Date()),
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
