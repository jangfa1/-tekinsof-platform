import { and, count, desc, eq, getTableColumns, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import { normalizePhonePe } from "../crm/accounts.ts";
import type { DbOrTx } from "../db/client.ts";
import { activities, campaigns, leads, outbox, users } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

export const PAGE_SIZE = 25;
export const leadStatuses = [
  "nuevo",
  "contactado",
  "calificado",
  "descartado",
  "convertido",
] as const;
export const manualSources = ["whatsapp", "referral", "manual", "event", "other"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

// Empty strings and nulls from forms mean "not provided".
const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());
const kebab = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Formato inválido");
const text = (max: number) => z.string().trim().max(max);
const phone = z
  .string()
  .trim()
  .min(6, "Teléfono inválido")
  .max(20, "Teléfono inválido")
  .regex(/^[0-9+ ()-]+$/, "Teléfono inválido");
const reachable = (lead: { email?: string; phone?: string }) => Boolean(lead.email || lead.phone);
const reachMessage = { message: "Indica un correo o un teléfono", path: ["email"] };

// Blueprint §5, POST /api/public/leads.
export const publicLeadInput = z
  .object({
    fullName: z.string().trim().min(2, "Indica tu nombre").max(120),
    email: opt(z.email("Correo inválido").trim().toLowerCase()),
    phone: opt(phone),
    companyName: opt(text(160)),
    serviceInterest: opt(kebab),
    message: opt(text(2000)),
    consent: z.literal(true, "Debes aceptar la política de privacidad"),
    consentVersion: z.string().trim().min(1),
    landingSlug: opt(kebab),
    campaignSlug: opt(kebab),
    utm: opt(
      z.object({
        source: opt(text(200)),
        medium: opt(text(200)),
        campaign: opt(text(200)),
        term: opt(text(200)),
        content: opt(text(200)),
      }),
    ),
    gclid: opt(text(500)),
    fbclid: opt(text(500)),
    ttclid: opt(text(500)),
    referrer: opt(text(500)),
    turnstileToken: z.string().min(1, "Verificación requerida"),
    website: z.string().optional(),
  })
  .refine(reachable, reachMessage);

export const manualLeadInput = z
  .object({
    fullName: z.string().trim().min(2, "Indica el nombre").max(120),
    email: opt(z.email("Correo inválido").trim().toLowerCase()),
    phone: opt(phone),
    companyName: opt(text(160)),
    serviceInterest: opt(kebab),
    message: opt(text(2000)),
    source: z.preprocess(blank, z.enum(manualSources).default("whatsapp")),
  })
  .refine(reachable, reachMessage);

const invalidPhone = { phone: "Teléfono inválido" };
function normalizedPhone(raw: string | undefined): Result<string | null> {
  if (!raw) return ok(null);
  const value = normalizePhonePe(raw);
  return value ? ok(value) : err("VALIDATION_ERROR", "Datos inválidos", invalidPhone);
}

export async function createPublicLead(
  db: DbOrTx,
  input: z.input<typeof publicLeadInput>,
): Promise<Result<{ leadId: string | null; deduplicated: boolean }>> {
  // Honeypot filled: answer as if it worked and write nothing (never tell the bot).
  if (input?.website) return ok({ leadId: null, deduplicated: false });
  const parsed = publicLeadInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { utm, campaignSlug: slug, turnstileToken, website, consent, ...data } = parsed.data;
  const phoneResult = normalizedPhone(data.phone);
  if (!phoneResult.ok) return phoneResult;
  const phone = phoneResult.data;
  const [duplicate] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        data.email ? sql`lower(${leads.email}) = ${data.email}` : eq(leads.phone, phone ?? ""),
        gt(leads.createdAt, sql`now() - interval '24 hours'`),
        isNull(leads.deletedAt),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (duplicate) return ok({ leadId: duplicate.id, deduplicated: true });

  const campaignSlug = slug ?? utm?.campaign;
  const [campaign] = campaignSlug
    ? await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.slug, campaignSlug))
    : [];

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(leads)
      .values({
        ...data,
        source: data.landingSlug ? "landing" : "web_form",
        campaignId: campaign?.id ?? null,
        phone,
        utmSource: utm?.source,
        utmMedium: utm?.medium,
        utmCampaign: utm?.campaign,
        utmTerm: utm?.term,
        utmContent: utm?.content,
        consentAt: new Date(),
      })
      .returning({ id: leads.id });
    if (!row) return err("INTERNAL", "No se pudo registrar el lead");
    await tx.insert(outbox).values({ eventName: "lead/created", payload: { leadId: row.id } });
    return ok({ leadId: row.id, deduplicated: false });
  });
}

export async function createManualLead(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof manualLeadInput>,
): Promise<Result<{ leadId: string }>> {
  if (!can(actor, "leads.create")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = manualLeadInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { phone: rawPhone, ...data } = parsed.data;
  const phoneResult = normalizedPhone(rawPhone);
  if (!phoneResult.ok) return phoneResult;
  const ownerId = actor.role === "ventas" ? actor.id : null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(leads)
      .values({
        ...data,
        phone: phoneResult.data,
        ownerId,
        assignedAt: ownerId ? new Date() : null,
        createdBy: actor.id,
      })
      .returning({ id: leads.id });
    if (!row) return err("INTERNAL", "No se pudo registrar el lead");
    await tx.insert(outbox).values({ eventName: "lead/created", payload: { leadId: row.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "lead.created",
      targetType: "lead",
      targetId: row.id,
      metadata: { source: data.source },
    });
    return ok({ leadId: row.id });
  });
}

// Blueprint §5. `convertido` is only set by convertLead (step 13).
const transitions: Record<LeadStatus, readonly LeadStatus[]> = {
  nuevo: ["contactado", "descartado"],
  contactado: ["calificado", "descartado"],
  calificado: ["convertido", "descartado"],
  descartado: ["nuevo"],
  convertido: [],
};

const statusInput = z.object({
  leadId: z.uuid(),
  to: z.enum(leadStatuses, "Estado inválido"),
  reason: opt(text(500)),
});

export async function changeLeadStatus(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof statusInput>,
): Promise<Result<{ leadId: string; status: LeadStatus }>> {
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { leadId, to, reason } = parsed.data;
  const [lead] = await db
    .select({
      status: leads.status,
      ownerId: leads.ownerId,
      firstContactedAt: leads.firstContactedAt,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return err("NOT_FOUND", "Lead no encontrado");
  if (!can(actor, "leads.update_own", { ownerId: lead.ownerId })) {
    return err("FORBIDDEN", "Solo el dueño del lead puede cambiar su estado");
  }
  const from = lead.status as LeadStatus;
  if (to === "convertido" || !transitions[from]?.includes(to)) {
    return err("INVALID_TRANSITION", `No se puede pasar de ${from} a ${to}`);
  }
  if (from === "descartado" && !can(actor, "leads.update_any")) {
    return err("FORBIDDEN", "Solo Gerencia puede reabrir un lead descartado");
  }
  if (to === "descartado" && !reason) {
    return err("VALIDATION_ERROR", "Datos inválidos", { reason: "Indica el motivo" });
  }

  return db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        status: to,
        ...(to === "descartado" ? { discardReason: reason } : {}),
        ...(to === "contactado" && !lead.firstContactedAt ? { firstContactedAt: new Date() } : {}),
      })
      .where(eq(leads.id, leadId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "lead.status_changed",
      targetType: "lead",
      targetId: leadId,
      metadata: { from, to, ...(reason ? { reason } : {}) },
    });
    return ok({ leadId, status: to });
  });
}

export type LeadFilters = {
  status?: string;
  ownerId?: string;
  source?: string;
  campaignId?: string;
  page?: number;
};

const leadColumns = {
  ...getTableColumns(leads),
  ownerName: users.name,
  campaignName: campaigns.name,
  campaignSlug: campaigns.slug,
};

export async function listLeads(db: DbOrTx, filters: LeadFilters) {
  const where = and(
    isNull(leads.deletedAt),
    filters.status ? eq(leads.status, filters.status) : undefined,
    filters.ownerId ? eq(leads.ownerId, filters.ownerId) : undefined,
    filters.source ? eq(leads.source, filters.source) : undefined,
    filters.campaignId ? eq(leads.campaignId, filters.campaignId) : undefined,
  );
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [rows, [total]] = await Promise.all([
    db
      .select(leadColumns)
      .from(leads)
      .leftJoin(users, eq(leads.ownerId, users.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(leads).where(where),
  ]);
  const n = total?.n ?? 0;
  return { rows, total: n, pageCount: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

export async function getLead(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [lead] = await db
    .select(leadColumns)
    .from(leads)
    .leftJoin(users, eq(leads.ownerId, users.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)));
  if (!lead) return null;
  const leadActivities = await db
    .select()
    .from(activities)
    .where(eq(activities.leadId, id))
    .orderBy(desc(activities.createdAt));
  return { ...lead, activities: leadActivities };
}
