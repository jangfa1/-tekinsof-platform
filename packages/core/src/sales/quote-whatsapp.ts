import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { err, ok, type Result } from "../result.ts";
import type { FileStore } from "../storage/files.ts";
import { ensureQuotePdf } from "./quote-delivery.ts";
import { formatAmount } from "./quote-math.ts";
import { getQuote } from "./quote-queries.ts";
import { markQuoteSent } from "./quotes.ts";

// WhatsApp delivery without a public link (a client portal is a Non-Goal): the seller downloads
// the PDF and attaches it in the chat this prepares. An approved quote becomes "enviada" here,
// as it would after the e-mail; re-sharing a sent quote changes nothing.

const SHAREABLE = new Set(["aprobada", "enviada", "aceptada", "rechazada", "vencida"]);

// "+51 999 888 777" or "999888777" → "51999888777"; null when it cannot be a phone number.
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) return `51${digits}`; // Peruvian mobile without country code
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsappUrl(phone: string | null, message: string): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;
}

export async function shareQuoteByWhatsapp(
  db: DbOrTx,
  deps: { store: FileStore },
  actor: Actor,
  quoteId: string,
): Promise<Result<{ url: string; fileName: string; phone: string | null }>> {
  const quote = await getQuote(db, quoteId);
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  if (!can(actor, "quotes.send_own", { ownerId: quote.ownerId }))
    return err("FORBIDDEN", "Sin permiso");
  if (quote.status === "borrador" || quote.status === "pendiente_aprobacion")
    return err("APPROVAL_REQUIRED", "La cotización debe estar aprobada antes de enviarse");
  if (!SHAREABLE.has(quote.status))
    return err("INVALID_TRANSITION", "Esta versión fue reemplazada");

  const pdf = await ensureQuotePdf(db, deps, quoteId);
  if (!pdf.ok) return pdf;
  const wasApproved = quote.status === "aprobada";
  const result = await db.transaction(async (tx) => {
    if (wasApproved) {
      const marked = await markQuoteSent(tx, quoteId, { pdfPath: pdf.data.path });
      if (!marked.ok) return marked;
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: "quote.shared_whatsapp",
      targetType: "quote",
      targetId: quoteId,
      metadata: { markedSent: wasApproved },
    });
    return ok(null);
  });
  if (!result.ok) return result;

  const symbol = quote.currency === "USD" ? "US$" : "S/";
  const greeting = quote.contact?.fullName ? `Hola ${quote.contact.fullName}` : "Hola";
  const message = [
    `${greeting}, le saludamos de Tekinsof Consulting.`,
    `Le adjuntamos la cotización ${quote.number} (versión ${quote.version}) por un total de ${symbol} ${formatAmount(quote.totalCents)}, IGV incluido.`,
    "Quedamos atentos a sus comentarios.",
    quote.owner?.name ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const phone = whatsappNumber(quote.contact?.phone ?? quote.company?.phone);
  return ok({ url: whatsappUrl(phone, message), fileName: pdf.data.fileName, phone });
}
