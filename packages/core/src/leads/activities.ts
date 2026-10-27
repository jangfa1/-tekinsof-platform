import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { activities, leads, opportunities, users } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

export const activityTypes = ["llamada", "reunion", "correo", "whatsapp", "tarea", "nota"] as const;

// Activity types that count as a first contact with the prospect (blueprint §4, leads).
const contactTypes = new Set(["llamada", "reunion", "correo", "whatsapp"]);

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);

export const activityInput = z
  .object({
    type: z.enum(activityTypes, "Tipo inválido"),
    subject: z.string().trim().min(1, "Indica el asunto").max(200),
    notes: z.preprocess(blank, z.string().trim().max(4000).optional()),
    dueAt: z.preprocess(blank, z.coerce.date("Fecha inválida").optional()),
    leadId: z.preprocess(blank, z.uuid().optional()),
    opportunityId: z.preprocess(blank, z.uuid().optional()),
    contactId: z.preprocess(blank, z.uuid().optional()),
  })
  .refine((a) => Boolean(a.leadId || a.opportunityId || a.contactId), {
    message: "La actividad necesita un lead, una oportunidad o un contacto",
    path: ["leadId"],
  });

export async function addActivity(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof activityInput>,
): Promise<Result<{ activityId: string }>> {
  const parsed = activityInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  let lead: { status: string; firstContactedAt: Date | null } | undefined;
  if (data.leadId) {
    const [row] = await db
      .select({
        status: leads.status,
        ownerId: leads.ownerId,
        firstContactedAt: leads.firstContactedAt,
      })
      .from(leads)
      .where(and(eq(leads.id, data.leadId), isNull(leads.deletedAt)));
    if (!row) return err("NOT_FOUND", "Lead no encontrado");
    if (!can(actor, "leads.update_own", { ownerId: row.ownerId }))
      return err("FORBIDDEN", "No tienes permiso");
    lead = row;
  } else if (data.opportunityId) {
    const [row] = await db
      .select({ ownerId: opportunities.ownerId })
      .from(opportunities)
      .where(and(eq(opportunities.id, data.opportunityId), isNull(opportunities.deletedAt)));
    if (!row) return err("NOT_FOUND", "Oportunidad no encontrada");
    if (!can(actor, "opportunities.write_own", row)) return err("FORBIDDEN", "No tienes permiso");
  } else if (!can(actor, "accounts.write")) {
    return err("FORBIDDEN", "No tienes permiso");
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({ ...data, ownerId: actor.id })
      .returning({ id: activities.id });
    if (!row) return err("INTERNAL", "No se pudo registrar la actividad");
    if (data.leadId && lead && !lead.firstContactedAt && contactTypes.has(data.type)) {
      await tx
        .update(leads)
        .set({
          firstContactedAt: new Date(),
          ...(lead.status === "nuevo" ? { status: "contactado" } : {}),
        })
        .where(eq(leads.id, data.leadId));
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: "activity.created",
      targetType: "activity",
      targetId: row.id,
      metadata: { type: data.type, leadId: data.leadId, opportunityId: data.opportunityId },
    });
    return ok({ activityId: row.id });
  });
}

export async function completeActivity(
  db: DbOrTx,
  actor: Actor,
  activityId: string,
): Promise<Result<{ activityId: string }>> {
  if (!z.uuid().safeParse(activityId).success) return err("NOT_FOUND", "Actividad no encontrada");
  const [activity] = await db
    .select({
      ownerId: activities.ownerId,
      opportunityId: activities.opportunityId,
      doneAt: activities.doneAt,
    })
    .from(activities)
    .where(eq(activities.id, activityId));
  if (!activity) return err("NOT_FOUND", "Actividad no encontrada");
  const permission = activity.opportunityId ? "opportunities.write_own" : "leads.update_own";
  if (!can(actor, permission, { ownerId: activity.ownerId }))
    return err("FORBIDDEN", "No tienes permiso");
  if (!activity.doneAt) {
    await db.update(activities).set({ doneAt: new Date() }).where(eq(activities.id, activityId));
  }
  return ok({ activityId });
}

export async function listActivities(
  db: DbOrTx,
  parent: { leadId?: string; opportunityId?: string },
) {
  const where = parent.leadId
    ? eq(activities.leadId, parent.leadId)
    : parent.opportunityId
      ? eq(activities.opportunityId, parent.opportunityId)
      : undefined;
  if (!where) return [];
  return db
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      notes: activities.notes,
      dueAt: activities.dueAt,
      doneAt: activities.doneAt,
      createdAt: activities.createdAt,
      ownerId: activities.ownerId,
      ownerName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(activities.ownerId, users.id))
    .where(where)
    .orderBy(desc(activities.createdAt));
}
