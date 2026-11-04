import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { appSettings, quotes, users } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

// The commercial-document side of a quote: item sections and types, the cover letter, the
// commercial conditions and remarks printed on the PDF, and the defaults Gerencia maintains.

export const quoteSections = ["producto", "servicio"] as const;
export type QuoteSection = (typeof quoteSections)[number];

export const productTypes = ["hardware", "software", "licencia", "equipo", "suscripcion"] as const;
export const serviceTypes = [
  "implementacion",
  "capacitacion",
  "soporte",
  "consultoria",
  "desarrollo",
  "automatizacion",
] as const;
export type QuoteItemType = (typeof productTypes)[number] | (typeof serviceTypes)[number];

export const itemTypeLabels: Record<QuoteItemType, string> = {
  hardware: "Hardware",
  software: "Software",
  licencia: "Licencia",
  equipo: "Equipo",
  suscripcion: "Suscripción",
  implementacion: "Implementación",
  capacitacion: "Capacitación",
  soporte: "Soporte",
  consultoria: "Consultoría",
  desarrollo: "Desarrollo",
  automatizacion: "Automatización",
};

export const typesBySection: Record<QuoteSection, readonly QuoteItemType[]> = {
  producto: productTypes,
  servicio: serviceTypes,
};

export function isTypeOfSection(section: QuoteSection, type: string): type is QuoteItemType {
  return (typesBySection[section] as readonly string[]).includes(type);
}

// ─── Document texts ──────────────────────────────────────────────────────────────────────────
export const documentFields = [
  "intro",
  "paymentTerms",
  "deliveryTime",
  "warranty",
  "scope",
  "exclusions",
  "observations",
] as const;
export type DocumentField = (typeof documentFields)[number];
export type QuoteDefaults = Record<DocumentField, string>;

export const builtInQuoteDefaults: QuoteDefaults = {
  intro:
    "Estimados señores:\n\nPor medio de la presente nos es grato saludarles y alcanzar nuestra propuesta económica correspondiente a los productos y servicios solicitados.",
  paymentTerms: "50% a la aceptación de la propuesta y 50% contra entrega.",
  deliveryTime: "A coordinar a la aceptación de la propuesta.",
  warranty: "Productos: según garantía del fabricante. Servicios: 30 días desde su entrega.",
  scope: "Los productos y servicios detallados en la presente propuesta.",
  exclusions: "Todo producto o servicio no indicado expresamente en la presente propuesta.",
  observations: [
    "Oferta válida únicamente por los ítems cotizados.",
    "Los precios no incluyen IGV salvo indicación expresa.",
    "Cualquier cambio será cotizado por separado.",
    "Los servicios no indicados expresamente no están incluidos.",
  ].join("\n"),
};

const QUOTE_DEFAULTS_KEY = "quote_defaults";
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;
const longText = z.preprocess(blankToNull, z.string().trim().max(4000).nullable().optional());

export async function getQuoteDefaults(db: DbOrTx): Promise<QuoteDefaults> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, QUOTE_DEFAULTS_KEY));
  const stored = (row?.value ?? {}) as Partial<QuoteDefaults>;
  const merged = { ...builtInQuoteDefaults };
  for (const field of documentFields) {
    const value = stored[field];
    if (typeof value === "string") merged[field] = value;
  }
  return merged;
}

export const quoteDefaultsInput = z.object(
  Object.fromEntries(
    documentFields.map((field) => [field, z.string().trim().max(4000).default("")]),
  ) as Record<DocumentField, z.ZodDefault<z.ZodString>>,
);

export async function setQuoteDefaults(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof quoteDefaultsInput>,
): Promise<Result<QuoteDefaults>> {
  if (!can(actor, "settings.manage")) return err("FORBIDDEN", "Sin permiso");
  const parsed = quoteDefaultsInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const value = parsed.data as QuoteDefaults;
  return db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: QUOTE_DEFAULTS_KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "settings.quote_defaults_updated",
      targetType: "app_setting",
      targetId: QUOTE_DEFAULTS_KEY,
      metadata: {},
    });
    return ok(value);
  });
}

export const quoteDocumentInput = z.object({
  ...Object.fromEntries(documentFields.map((field) => [field, longText])),
  notes: longText,
  terms: longText,
}) as z.ZodType<Partial<Record<DocumentField | "notes" | "terms", string | null>>>;

// Edits the printed texts of a draft. Sent quotes are frozen like their items.
export async function updateQuoteDocument(
  db: DbOrTx,
  actor: Actor,
  quoteId: string,
  input: z.input<typeof quoteDocumentInput>,
): Promise<Result<{ quoteId: string }>> {
  if (!z.uuid().safeParse(quoteId).success) return err("NOT_FOUND", "Cotización no encontrada");
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  if (!can(actor, "quotes.write_own", { ownerId: quote.ownerId }))
    return err("FORBIDDEN", "Sin permiso");
  if (quote.status !== "borrador")
    return err("INVALID_TRANSITION", "Solo un borrador se edita; crea una nueva versión");
  const parsed = quoteDocumentInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const changes = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );
  return db.transaction(async (tx) => {
    if (Object.keys(changes).length)
      await tx.update(quotes).set(changes).where(eq(quotes.id, quoteId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "quote.document_updated",
      targetType: "quote",
      targetId: quoteId,
      metadata: { fields: Object.keys(changes) },
    });
    return ok({ quoteId });
  });
}

// ─── Signature block ─────────────────────────────────────────────────────────────────────────
export const signatureInput = z.object({
  jobTitle: z.preprocess(blankToNull, z.string().trim().max(120).nullable()),
  phone: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{6,20}$/, "Teléfono inválido")
      .nullable(),
  ),
});

// Every user edits their own signature; Gerencia (users.manage) edits anyone's.
export async function updateUserSignature(
  db: DbOrTx,
  actor: Actor,
  userId: string,
  input: z.input<typeof signatureInput>,
): Promise<Result<{ userId: string }>> {
  if (userId !== actor.id && !can(actor, "users.manage")) return err("FORBIDDEN", "Sin permiso");
  const parsed = signatureInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set(parsed.data)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!updated.length) return err("NOT_FOUND", "Usuario no encontrado");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.signature_updated",
      targetType: "user",
      targetId: userId,
      metadata: {},
    });
    return ok({ userId });
  });
}
