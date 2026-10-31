import { and, count, desc, eq, getTableColumns, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import { normalizePhonePe } from "../crm/accounts.ts";
import type { DbOrTx } from "../db/client.ts";
import { activities, campaigns, leads, outbox, users } from "../db/schema.ts";
import { platformFromAttribution, recordTouchpoint } from "../marketing/attribution.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import {
  type LeadStatus,
  leadStatuses,
  manualLeadInput,
  opt,
  publicLeadInput,
  text,
} from "./schemas.ts";

export const PAGE_SIZE = 25;

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
  const campaignSlug = slug ?? utm?.campaign;
  const [campaign] = campaignSlug
    ? await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.slug, campaignSlug))
    : [];
  const attribution = {
    landingSlug: data.landingSlug,
    campaignId: campaign?.id ?? null,
    utmSource: utm?.source,
    utmMedium: utm?.medium,
    utmCampaign: utm?.campaign,
    utmTerm: utm?.term,
    utmContent: utm?.content,
    gclid: data.gclid,
    fbclid: data.fbclid,
    ttclid: data.ttclid,
    referrer: data.referrer,
    adPlatform: platformFromAttribution({ ...data, utmSource: utm?.source }),
  };
  const source = data.landingSlug ? "landing" : "web_form";
  const now = new Date();
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
  // The same prospect again within 24 h: no new lead, but the visit is kept as a touchpoint.
  if (duplicate) {
    await recordTouchpoint(db, duplicate.id, { ...attribution, source }, now, false);
    return ok({ leadId: duplicate.id, deduplicated: true });
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(leads)
      .values({ ...data, ...attribution, source, phone, consentAt: now })
      .returning({ id: leads.id });
    if (!row) return err("INTERNAL", "No se pudo registrar el lead");
    await recordTouchpoint(tx, row.id, { ...attribution, source }, now, true);
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
    await recordTouchpoint(tx, row.id, { source: data.source }, new Date(), true);
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
  grade?: string;
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
    filters.grade ? eq(leads.grade, filters.grade) : undefined,
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
