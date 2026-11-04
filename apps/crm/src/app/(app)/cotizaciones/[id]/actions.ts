"use server";

import { getDb } from "@tekinsof/core/db/client";
import { createMailer } from "@tekinsof/core/integrations/graph";
import { sendQuote } from "@tekinsof/core/sales/quote-delivery";
import { documentFields, updateQuoteDocument } from "@tekinsof/core/sales/quote-document";
import { toHundredths } from "@tekinsof/core/sales/quote-math";
import { shareQuoteByWhatsapp } from "@tekinsof/core/sales/quote-whatsapp";
import {
  approveQuote,
  markQuoteOutcome,
  newQuoteVersion,
  setQuoteItems,
  submitQuote,
} from "@tekinsof/core/sales/quotes";
import { createFileStore } from "@tekinsof/core/storage/files";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/actor";
import { getEnv } from "@/lib/env";

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
  revalidatePath(`/cotizaciones/${id}`);
  redirect(`/cotizaciones/${id}?${new URLSearchParams(params).toString()}`);
}

function failure(id: string, error: Failure): never {
  const details = Object.entries(error.fields ?? {}).map(([field, message]) => {
    const row = /^items\.(\d+)/.exec(field)?.[1];
    return row === undefined ? message : `Ítem ${Number(row) + 1}: ${message}`;
  });
  back(id, { error: [error.message, ...details].join(" · ") });
}

function quoteStore() {
  const env = getEnv();
  return createFileStore({
    driver: env.STORAGE_DRIVER,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: "quotes",
  });
}

// Saves items and printed texts together; `op` adds a row, removes one or issues the quote.
export async function saveQuote(formData: FormData) {
  const id = str(formData, "quoteId");
  const op = str(formData, "op");
  const actor = await authorize("quotes.read");
  if (!actor.ok) failure(id, actor.error);
  const items = [];
  for (let i = 0; i < Number(formData.get("rows")); i++) {
    const row = (name: string) => str(formData, `items.${i}.${name}`);
    const filled = row("serviceId") || row("description") || row("price") || row("partNumber");
    if (op === `remove:${i}` || !filled) continue;
    const unitPriceCents = cents(row("price"));
    if (Number.isNaN(unitPriceCents)) failure(id, { message: `Ítem ${i + 1}: precio inválido` });
    items.push({
      section: row("section") === "producto" ? ("producto" as const) : ("servicio" as const),
      itemType: row("itemType"),
      partNumber: row("partNumber"),
      serviceId: row("serviceId"),
      description: row("description"),
      quantity: row("quantity") || "1",
      unitPriceCents: unitPriceCents ?? undefined,
    });
  }
  // Products first, then services: the order both tables and the PDF show.
  items.sort((a, b) => (a.section === b.section ? 0 : a.section === "producto" ? -1 : 1));
  const db = getDb();
  const saved = await setQuoteItems(db, actor.data, id, {
    discountPct: str(formData, "discountPct") || "0",
    items,
  });
  if (!saved.ok) failure(id, saved.error);
  const texts = Object.fromEntries(
    [...documentFields, "notes", "terms"].map((field) => [field, str(formData, `doc.${field}`)]),
  );
  const documented = await updateQuoteDocument(db, actor.data, id, texts);
  if (!documented.ok) failure(id, documented.error);

  const products = items.filter((item) => item.section === "producto").length;
  const services = items.length - products;
  if (op === "add:producto") back(id, { p: String(products + 1), s: String(services) });
  if (op === "add:servicio") back(id, { p: String(products), s: String(services + 1) });
  if (op === "submit") {
    const submitted = await submitQuote(db, actor.data, id);
    if (!submitted.ok) failure(id, submitted.error);
    back(id, { ok: "Cotización emitida" });
  }
  back(id, { ok: "Cambios guardados" });
}

export async function sendQuoteByEmail(formData: FormData) {
  const id = str(formData, "quoteId");
  const actor = await authorize("quotes.read");
  if (!actor.ok) failure(id, actor.error);
  const env = getEnv();
  const mailer = createMailer({
    driver: env.MAIL_DRIVER,
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
  });
  const result = await sendQuote(getDb(), { store: quoteStore(), mailer }, actor.data, id, {
    to: str(formData, "to"),
  });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: `Enviada a ${result.data.to}` });
}

// Called from the WhatsApp button (a client component): returns the envelope, never redirects.
export async function shareByWhatsapp(quoteId: string) {
  const actor = await authorize("quotes.read");
  if (!actor.ok) return actor;
  const result = await shareQuoteByWhatsapp(getDb(), { store: quoteStore() }, actor.data, quoteId);
  if (result.ok) revalidatePath(`/cotizaciones/${quoteId}`);
  return result;
}

export async function decideQuote(formData: FormData) {
  const id = str(formData, "quoteId");
  const actor = await authorize("quotes.approve");
  if (!actor.ok) failure(id, actor.error);
  const decision = str(formData, "decision") === "rechazar" ? "rechazar" : "aprobar";
  const result = await approveQuote(getDb(), actor.data, id, { decision });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: decision === "aprobar" ? "Cotización aprobada" : "Devuelta a borrador" });
}

export async function quoteLifecycle(formData: FormData) {
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
