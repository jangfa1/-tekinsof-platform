import { and, asc, desc, eq, getTableColumns, isNull, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  companies,
  contacts,
  leads,
  opportunities,
  opportunityServices,
  quotes,
  users,
} from "../db/schema.ts";
import { listActivities } from "../leads/activities.ts";
import { err, ok, type Result, validationError } from "../result.ts";

export const stages = ["calificacion", "propuesta", "negociacion", "ganada", "perdida"] as const;
export const openStages = ["calificacion", "propuesta", "negociacion"] as const;
export type Stage = (typeof stages)[number];

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
const optionalUuid = z.preprocess(blank, z.uuid().optional());

export const createOpportunityInput = z.object({
  title: z.string().trim().min(2, "Indica un título").max(200),
  companyId: optionalUuid,
  contactId: optionalUuid,
  amountCents: z.number().int().min(0).default(0),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  expectedCloseOn: z.preprocess(blank, z.iso.date("Fecha inválida").optional()),
  leadId: optionalUuid,
  serviceIds: z.array(z.uuid()).default([]),
  ownerId: z.preprocess(blank, z.string().optional()),
});

async function nextPosition(tx: DbOrTx, stage: Stage): Promise<number> {
  const [row] = await tx
    .select({ top: max(opportunities.position) })
    .from(opportunities)
    .where(and(eq(opportunities.stage, stage), isNull(opportunities.deletedAt)));
  return (row?.top ?? -1) + 1;
}

export async function createOpportunity(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof createOpportunityInput>,
): Promise<Result<{ opportunityId: string }>> {
  const parsed = createOpportunityInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { leadId, serviceIds, ownerId: requestedOwner, ...data } = parsed.data;
  const ownerId = requestedOwner ?? actor.id;
  if (!can(actor, "opportunities.write_own", { ownerId })) return err("FORBIDDEN", "Sin permiso");

  return db.transaction(async (tx) => {
    let { companyId, contactId } = data;
    if (leadId) {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
        .for("update");
      if (!lead) return err("NOT_FOUND", "Lead no encontrado");
      if (!can(actor, "leads.update_own", { ownerId: lead.ownerId }))
        return err("FORBIDDEN", "Sin permiso");
      const [existing] = await tx
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.leadId, leadId), isNull(opportunities.deletedAt)));
      if (existing) return err("CONFLICT", "El lead ya fue convertido");
      if (lead.status !== "calificado")
        return err("INVALID_TRANSITION", "Solo se convierte un lead calificado");

      companyId ??= lead.companyId ?? undefined;
      if (!companyId && lead.companyName) {
        const [company] = await tx
          .insert(companies)
          .values({ name: lead.companyName, ownerId, createdBy: actor.id })
          .returning({ id: companies.id });
        companyId = company?.id;
      }
      contactId ??= lead.contactId ?? undefined;
      if (!contactId) {
        // A contact with the lead's email already exists (unique lower(email)): reuse it.
        const sameEmail = lead.email
          ? sql`lower(${contacts.email}) = ${lead.email.toLowerCase()}`
          : sql`false`;
        const [existing] = await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(sameEmail, isNull(contacts.deletedAt)));
        const { fullName, email, phone } = lead;
        const [created] = existing
          ? []
          : await tx
              .insert(contacts)
              .values({ fullName, email, phone, companyId, ownerId })
              .returning({ id: contacts.id });
        contactId = (existing ?? created)?.id;
      }
      await tx
        .update(leads)
        .set({ status: "convertido", contactId: contactId ?? null, companyId: companyId ?? null })
        .where(eq(leads.id, leadId));
    }

    const [row] = await tx
      .insert(opportunities)
      .values({
        ...data,
        companyId,
        contactId,
        leadId,
        ownerId,
        position: await nextPosition(tx, "calificacion"),
      })
      .returning({ id: opportunities.id });
    if (!row) return err("INTERNAL", "No se pudo crear la oportunidad");
    if (serviceIds.length > 0) {
      await tx
        .insert(opportunityServices)
        .values(serviceIds.map((serviceId) => ({ opportunityId: row.id, serviceId })));
    }
    if (leadId) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: "lead.converted",
        targetType: "lead",
        targetId: leadId,
        metadata: { opportunityId: row.id, companyId, contactId },
      });
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: "opportunity.created",
      targetType: "opportunity",
      targetId: row.id,
      metadata: { title: data.title, leadId },
    });
    return ok({ opportunityId: row.id });
  });
}

// Loads an open opportunity the actor may change.
async function openOpportunityFor(db: DbOrTx, actor: Actor, id: string) {
  const [row] = await db
    .select({ id: opportunities.id, stage: opportunities.stage, ownerId: opportunities.ownerId })
    .from(opportunities)
    .where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)));
  if (!row) return err("NOT_FOUND", "Oportunidad no encontrada");
  if (!can(actor, "opportunities.write_own", row)) return err("FORBIDDEN", "Sin permiso");
  const open = (openStages as readonly string[]).includes(row.stage);
  return open ? ok(row) : err("INVALID_TRANSITION", "La oportunidad ya está cerrada");
}

const moveInput = z.object({
  opportunityId: z.uuid(),
  toStage: z.enum(openStages, "Etapa inválida"),
  toPosition: z.number().int().min(0),
});

export async function moveOpportunity(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof moveInput>,
): Promise<Result<{ opportunityId: string; stage: Stage; position: number }>> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { opportunityId, toStage, toPosition } = parsed.data;
  const found = await openOpportunityFor(db, actor, opportunityId);
  if (!found.ok) return found;
  const current = found.data;

  return db.transaction(async (tx) => {
    const others = and(isNull(opportunities.deletedAt), ne(opportunities.id, opportunityId));
    const columnIds = async (stage: string) => {
      const rows = await tx
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.stage, stage), others))
        .orderBy(asc(opportunities.position), asc(opportunities.createdAt));
      return rows.map((row) => row.id);
    };
    const target = await columnIds(toStage);
    const position = Math.min(toPosition, target.length);
    target.splice(position, 0, opportunityId);
    // Renumber 0…n-1 so a column never has gaps or ties.
    for (const [index, id] of target.entries()) {
      await tx
        .update(opportunities)
        .set(id === opportunityId ? { stage: toStage, position: index } : { position: index })
        .where(eq(opportunities.id, id));
    }
    if (current.stage !== toStage) {
      for (const [index, id] of (await columnIds(current.stage)).entries()) {
        await tx.update(opportunities).set({ position: index }).where(eq(opportunities.id, id));
      }
      await writeAudit(tx, {
        actorId: actor.id,
        action: "opportunity.moved",
        targetType: "opportunity",
        targetId: opportunityId,
        metadata: { from: current.stage, to: toStage },
      });
    }
    return ok({ opportunityId, stage: toStage, position });
  });
}

const closeInput = z.object({
  opportunityId: z.uuid(),
  outcome: z.enum(["ganada", "perdida"]),
  lostReason: z.preprocess(blank, z.string().trim().max(500).optional()),
});

export async function closeOpportunity(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof closeInput>,
): Promise<Result<{ opportunityId: string; stage: Stage }>> {
  const parsed = closeInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { opportunityId, outcome, lostReason } = parsed.data;
  const found = await openOpportunityFor(db, actor, opportunityId);
  if (!found.ok) return found;
  if (outcome === "perdida" && !lostReason) {
    return err("VALIDATION_ERROR", "Datos inválidos", { lostReason: "Indica el motivo" });
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx
      .update(opportunities)
      .set(
        outcome === "ganada"
          ? { stage: "ganada", wonAt: now }
          : { stage: "perdida", lostAt: now, lostReason },
      )
      .where(eq(opportunities.id, opportunityId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: outcome === "ganada" ? "opportunity.won" : "opportunity.lost",
      targetType: "opportunity",
      targetId: opportunityId,
      metadata: lostReason ? { lostReason } : {},
    });
    return ok({ opportunityId, stage: outcome });
  });
}

const withNames = {
  ...getTableColumns(opportunities),
  ownerName: users.name,
  companyName: companies.name,
};

function selectOpportunities(db: DbOrTx) {
  return db
    .select(withNames)
    .from(opportunities)
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .leftJoin(companies, eq(opportunities.companyId, companies.id))
    .$dynamic();
}

export type OpportunityCard = Awaited<ReturnType<typeof selectOpportunities>>[number];

export async function listOpportunitiesByStage(
  db: DbOrTx,
  opts: { ownerId?: string } = {},
): Promise<Record<Stage, OpportunityCard[]>> {
  const owner = opts.ownerId ? eq(opportunities.ownerId, opts.ownerId) : undefined;
  const rows = await selectOpportunities(db)
    .where(and(isNull(opportunities.deletedAt), owner))
    .orderBy(asc(opportunities.position), asc(opportunities.createdAt));
  const byStage = Object.fromEntries(stages.map((stage) => [stage, []])) as unknown as Record<
    Stage,
    OpportunityCard[]
  >;
  for (const row of rows) byStage[row.stage as Stage]?.push(row);
  return byStage;
}

export async function getOpportunity(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [opportunity] = await selectOpportunities(db).where(
    and(eq(opportunities.id, id), isNull(opportunities.deletedAt)),
  );
  if (!opportunity) return null;
  const [contact] = opportunity.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, opportunity.contactId))
    : [];
  const [activityRows, quoteRows] = await Promise.all([
    listActivities(db, { opportunityId: id }),
    db.select().from(quotes).where(eq(quotes.opportunityId, id)).orderBy(desc(quotes.createdAt)),
  ]);
  return { ...opportunity, contact: contact ?? null, activities: activityRows, quotes: quoteRows };
}
