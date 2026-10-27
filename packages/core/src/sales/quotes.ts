import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can, type Permission } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  appSettings,
  companies,
  contacts,
  opportunities,
  outbox,
  quoteItems,
  quoteSequences,
  quotes,
  services,
  users,
} from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { limaDate } from "../time/business-hours.ts";
import {
  computeQuoteTotals,
  lineTotalCents,
  type QuoteLine,
  requiresApproval,
  toHundredths,
} from "./quote-math.ts";

export const quoteStatuses = [
  "borrador",
  "pendiente_aprobacion",
  "aprobada",
  "enviada",
  "aceptada",
  "rechazada",
  "vencida",
  "reemplazada",
] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];
export const VALIDITY_DAYS = 15;
const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
const isDecimal = (value: string) => {
  try {
    toHundredths(value);
    return true;
  } catch {
    return false;
  }
};
const decimal = (message: string) => z.string().trim().refine(isDecimal, message);

type QuoteRow = typeof quotes.$inferSelect;

// Loads a quote the actor may act on with `permission` (resource = the quote's owner).
async function quoteFor(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  permission: Permission,
): Promise<Result<QuoteRow>> {
  if (!z.uuid().safeParse(quoteId).success) return err("NOT_FOUND", "Cotización no encontrada");
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  return can(actor, permission, { ownerId: quote.ownerId })
    ? ok(quote)
    : err("FORBIDDEN", "Sin permiso");
}

function audit(
  tx: DbOrTx,
  actor: Actor | null,
  action: string,
  quoteId: string,
  metadata: Record<string, unknown> = {},
) {
  return writeAudit(tx, {
    actorId: actor?.id ?? null,
    action,
    targetType: "quote",
    targetId: quoteId,
    metadata,
  });
}

export const createQuoteInput = z.object({
  opportunityId: z.uuid(),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  exchangeRate: z.preprocess(
    blank,
    z
      .string()
      .regex(/^\d{1,6}(\.\d{1,4})?$/, "Tipo de cambio inválido")
      .optional(),
  ),
  notes: z.preprocess(blank, z.string().trim().max(4000).optional()),
  terms: z.preprocess(blank, z.string().trim().max(4000).optional()),
});

export async function createQuote(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof createQuoteInput>,
  now: Date = new Date(),
): Promise<Result<{ quoteId: string; number: string }>> {
  const parsed = createQuoteInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { opportunityId, exchangeRate, ...data } = parsed.data;
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), isNull(opportunities.deletedAt)));
  if (!opportunity) return err("NOT_FOUND", "Oportunidad no encontrada");
  if (!can(actor, "quotes.write_own", { ownerId: opportunity.ownerId }))
    return err("FORBIDDEN", "Sin permiso");
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "exchange_rate_default"));
  const defaultRate = (setting?.value as { usdToPen?: string } | undefined)?.usdToPen ?? "3.7500";

  return db.transaction(async (tx) => {
    const year = Number(limaDate(now).slice(0, 4));
    // Gap-free numbering: the sequence row is locked by the upsert until the transaction commits.
    const [sequence] = await tx
      .insert(quoteSequences)
      .values({ year, lastNumber: 1 })
      .onConflictDoUpdate({
        target: quoteSequences.year,
        set: { lastNumber: sql`${quoteSequences.lastNumber} + 1` },
      })
      .returning({ lastNumber: quoteSequences.lastNumber });
    const number = `COT-${year}-${String(sequence?.lastNumber ?? 0).padStart(4, "0")}`;
    const [row] = await tx
      .insert(quotes)
      .values({
        ...data,
        number,
        opportunityId,
        exchangeRate: exchangeRate ?? defaultRate,
        companyId: opportunity.companyId,
        contactId: opportunity.contactId,
        ownerId: opportunity.ownerId,
      })
      .returning({ id: quotes.id });
    if (!row) return err("INTERNAL", "No se pudo crear la cotización");
    await audit(tx, actor, "quote.created", row.id, { number });
    return ok({ quoteId: row.id, number });
  });
}

export const quoteItemsInput = z.object({
  discountPct: decimal("Descuento inválido").refine(
    (v) => !isDecimal(v) || toHundredths(v) <= 10000,
    "Máximo 100%",
  ),
  items: z
    .array(
      z.object({
        serviceId: z.preprocess(blank, z.uuid().optional()),
        description: z.preprocess(blank, z.string().trim().max(500).optional()),
        quantity: decimal("Cantidad inválida").refine(
          (v) => !isDecimal(v) || toHundredths(v) > 0,
          "Debe ser mayor que 0",
        ),
        unitPriceCents: z.number().int().min(0).optional(),
      }),
    )
    .max(50),
});

export async function setQuoteItems(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  input: z.input<typeof quoteItemsInput>,
): Promise<Result<{ quoteId: string; totalCents: number }>> {
  const found = await quoteFor(db, actor, quoteId, "quotes.write_own");
  if (!found.ok) return found;
  if (found.data.status !== "borrador")
    return err("INVALID_TRANSITION", "Solo un borrador se edita; crea una nueva versión");
  const parsed = quoteItemsInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { discountPct, items } = parsed.data;

  const serviceIds = items.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
  const catalog = serviceIds.length
    ? await db.select().from(services).where(inArray(services.id, serviceIds))
    : [];
  const lines: Array<typeof quoteItems.$inferInsert & QuoteLine> = [];
  for (const [index, item] of items.entries()) {
    const service = catalog.find((s) => s.id === item.serviceId);
    const description = item.description ?? service?.name;
    const unitPriceCents = item.unitPriceCents ?? service?.basePriceCents;
    if (!description || unitPriceCents === undefined) {
      return err("VALIDATION_ERROR", "Datos inválidos", {
        [`items.${index}`]: "Indica descripción y precio",
      });
    }
    const line = { quantity: item.quantity, unitPriceCents };
    lines.push({
      ...line,
      quoteId,
      serviceId: item.serviceId ?? null,
      description,
      lineTotalCents: lineTotalCents(line),
      sortOrder: index,
    });
  }
  const totals = computeQuoteTotals(lines, discountPct);

  return db.transaction(async (tx) => {
    await tx.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    if (lines.length) await tx.insert(quoteItems).values(lines);
    await tx
      .update(quotes)
      .set({ ...totals, discountPct })
      .where(eq(quotes.id, quoteId));
    await audit(tx, actor, "quote.items_set", quoteId, {
      items: lines.length,
      discountPct,
      totalCents: totals.totalCents,
    });
    return ok({ quoteId, totalCents: totals.totalCents });
  });
}

export async function submitQuote(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  now: Date = new Date(),
): Promise<Result<{ quoteId: string; status: QuoteStatus }>> {
  const found = await quoteFor(db, actor, quoteId, "quotes.write_own");
  if (!found.ok) return found;
  const quote = found.data;
  if (quote.status !== "borrador") return err("INVALID_TRANSITION", "La cotización ya fue emitida");
  const [items] = await db
    .select({ n: count() })
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId));
  if (!items?.n)
    return err("VALIDATION_ERROR", "Datos inválidos", { items: "Agrega al menos un ítem" });
  const issuedOn = limaDate(now);
  const validUntil = new Date(Date.parse(`${issuedOn}T00:00:00Z`) + VALIDITY_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const status: QuoteStatus = requiresApproval(quote.discountPct)
    ? "pendiente_aprobacion"
    : "aprobada";

  return db.transaction(async (tx) => {
    await tx.update(quotes).set({ status, issuedOn, validUntil }).where(eq(quotes.id, quoteId));
    if (status === "pendiente_aprobacion") {
      await tx
        .insert(outbox)
        .values({ eventName: "quote/approval.requested", payload: { quoteId } });
    }
    await audit(tx, actor, "quote.submitted", quoteId, { status, discountPct: quote.discountPct });
    return ok({ quoteId, status });
  });
}

export async function approveQuote(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  input: { decision: "aprobar" | "rechazar" },
): Promise<Result<{ quoteId: string; status: QuoteStatus }>> {
  const found = await quoteFor(db, actor, quoteId, "quotes.approve");
  if (!found.ok) return found;
  if (found.data.status !== "pendiente_aprobacion")
    return err("INVALID_TRANSITION", "La cotización no espera aprobación");
  const approved = input.decision === "aprobar";
  return db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set(
        approved
          ? { status: "aprobada", approvedBy: actor.id, approvedAt: new Date() }
          : { status: "borrador", issuedOn: null, validUntil: null },
      )
      .where(eq(quotes.id, quoteId));
    await audit(tx, actor, approved ? "quote.approved" : "quote.approval_rejected", quoteId);
    return ok({ quoteId, status: approved ? "aprobada" : "borrador" });
  });
}

// Called by quote delivery after the PDF was stored and the mail went out.
export async function markQuoteSent(
  tx: DbOrTx,
  quoteId: string,
  input: { pdfPath: string },
): Promise<Result<{ quoteId: string }>> {
  const [quote] = await tx
    .select({ status: quotes.status })
    .from(quotes)
    .where(eq(quotes.id, quoteId));
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  if (quote.status !== "aprobada")
    return err("INVALID_TRANSITION", "Solo se envía una cotización aprobada");
  await tx
    .update(quotes)
    .set({ status: "enviada", sentAt: new Date(), pdfPath: input.pdfPath })
    .where(eq(quotes.id, quoteId));
  await audit(tx, null, "quote.sent", quoteId, { pdfPath: input.pdfPath });
  return ok({ quoteId });
}

export async function markQuoteOutcome(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  outcome: "aceptada" | "rechazada",
): Promise<Result<{ quoteId: string; status: QuoteStatus }>> {
  const found = await quoteFor(db, actor, quoteId, "quotes.write_own");
  if (!found.ok) return found;
  if (found.data.status !== "enviada")
    return err("INVALID_TRANSITION", "Solo una cotización enviada se acepta o rechaza");
  return db.transaction(async (tx) => {
    await tx.update(quotes).set({ status: outcome }).where(eq(quotes.id, quoteId));
    await audit(tx, actor, outcome === "aceptada" ? "quote.accepted" : "quote.rejected", quoteId);
    return ok({ quoteId, status: outcome });
  });
}

export async function newQuoteVersion(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
): Promise<Result<{ quoteId: string; version: number }>> {
  const found = await quoteFor(db, actor, quoteId, "quotes.write_own");
  if (!found.ok) return found;
  const { id, version, createdAt, updatedAt, ...header } = found.data;
  if (header.status === "aceptada" || header.status === "reemplazada") {
    return err("INVALID_TRANSITION", "Esta cotización ya no admite nuevas versiones");
  }
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
  return db.transaction(async (tx) => {
    await tx.update(quotes).set({ status: "reemplazada" }).where(eq(quotes.id, id));
    const [row] = await tx
      .insert(quotes)
      .values({
        ...header,
        version: version + 1,
        status: "borrador",
        issuedOn: null,
        validUntil: null,
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        expiryAlertedAt: null,
        pdfPath: null,
      })
      .returning({ id: quotes.id });
    if (!row) return err("INTERNAL", "No se pudo versionar la cotización");
    if (items.length)
      await tx
        .insert(quoteItems)
        .values(items.map(({ id: _id, ...item }) => ({ ...item, quoteId: row.id })));
    await audit(tx, actor, "quote.versioned", row.id, { from: id, version: version + 1 });
    return ok({ quoteId: row.id, version: version + 1 });
  });
}

const listColumns = {
  id: quotes.id,
  number: quotes.number,
  version: quotes.version,
  status: quotes.status,
  currency: quotes.currency,
  totalCents: quotes.totalCents,
  validUntil: quotes.validUntil,
  createdAt: quotes.createdAt,
  opportunityTitle: opportunities.title,
  companyName: companies.name,
  ownerName: users.name,
};

export async function listQuotes(db: DbOrTx, opts: { status?: string; page?: number }) {
  const where = opts.status ? eq(quotes.status, opts.status) : undefined;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [rows, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(quotes)
      .innerJoin(opportunities, eq(quotes.opportunityId, opportunities.id))
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(users, eq(quotes.ownerId, users.id))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(quotes).where(where),
  ]);
  return {
    rows,
    total: total?.n ?? 0,
    pageCount: Math.max(1, Math.ceil((total?.n ?? 0) / PAGE_SIZE)),
  };
}

export async function getQuote(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) return null;
  const [items, [opportunity], [company], [contact], [owner]] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.sortOrder)),
    db.select().from(opportunities).where(eq(opportunities.id, quote.opportunityId)),
    quote.companyId ? db.select().from(companies).where(eq(companies.id, quote.companyId)) : [],
    quote.contactId ? db.select().from(contacts).where(eq(contacts.id, quote.contactId)) : [],
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, quote.ownerId)),
  ]);
  return {
    ...quote,
    items,
    opportunity: opportunity ?? null,
    company: company ?? null,
    contact: contact ?? null,
    owner: owner ?? null,
  };
}
