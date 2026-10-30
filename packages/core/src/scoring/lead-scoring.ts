import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { leadScores, leads, scoringModels } from "../db/schema.ts";
import { blank } from "../leads/schemas.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import {
  defaultScoringModel,
  type ScoringModel,
  scoringRules,
  scoringThresholds,
} from "./model.ts";
import { budgetRanges, companySizes, companyTypes, type Grade } from "./options.ts";
import { type ScoreReason, type ScoringInput, scoreLead } from "./rules.ts";

// Stores a lead's grade: one lead_scores row per scoring (history) plus the latest score and
// grade on the lead for the inbox. The grade is shown and filtered on; it never changes who gets
// the lead or the SLA (decided 2026-10-30).

// The active model; the first call activates version 1 so a fresh database scores without setup.
export async function getActiveModel(db: DbOrTx): Promise<ScoringModel> {
  const active = () =>
    db
      .select({
        version: scoringModels.version,
        rules: scoringModels.rules,
        thresholds: scoringModels.thresholds,
      })
      .from(scoringModels)
      .where(eq(scoringModels.isActive, true));
  let [row] = await active();
  if (!row) {
    await db
      .insert(scoringModels)
      .values({ ...defaultScoringModel, isActive: true })
      .onConflictDoNothing();
    [row] = await active();
  }
  const rules = scoringRules.safeParse(row?.rules);
  const thresholds = scoringThresholds.safeParse(row?.thresholds);
  // A stored model that no longer parses never blocks a lead: score with the built-in one.
  if (!row || !rules.success || !thresholds.success) return defaultScoringModel;
  return { version: row.version, rules: rules.data, thresholds: thresholds.data };
}

export type StoredScore = { score: number; grade: Grade; reasons: ScoreReason[] };

export async function scoreAndStore(
  db: DbOrTx,
  leadId: string,
  now: Date,
  options: { onlyIfUnscored?: boolean } = {},
): Promise<Result<StoredScore | null>> {
  const [lead] = await db
    .select({
      source: leads.source,
      serviceInterest: leads.serviceInterest,
      budgetRange: leads.budgetRange,
      companySize: leads.companySize,
      companyType: leads.companyType,
      email: leads.email,
      phone: leads.phone,
      companyName: leads.companyName,
      message: leads.message,
      isTest: leads.isTest,
      scoredAt: leads.scoredAt,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return err("NOT_FOUND", "Lead no encontrado");
  // Platform test leads stay out of the grades; a retried `lead/created` does not score twice.
  if (lead.isTest || (options.onlyIfUnscored && lead.scoredAt)) return ok(null);

  const { isTest, scoredAt, ...fields } = lead;
  const input = fields as ScoringInput;
  const model = await getActiveModel(db);
  const result = scoreLead(input, model);
  await db.transaction(async (tx) => {
    await tx.insert(leadScores).values({
      leadId,
      scoringModelVersion: model.version,
      score: result.score,
      grade: result.grade,
      reasons: result.reasons,
      inputs: input,
      scoredAt: now,
    });
    await tx
      .update(leads)
      .set({ score: result.score, grade: result.grade, scoredAt: now })
      .where(eq(leads.id, leadId));
  });
  return ok(result);
}

export async function listLeadScores(db: DbOrTx, leadId: string) {
  return db
    .select()
    .from(leadScores)
    .where(eq(leadScores.leadId, leadId))
    .orderBy(desc(leadScores.scoredAt), desc(leadScores.createdAt));
}

// Gerencia, after publishing a new model version: every live lead gets graded again.
export async function rescoreAll(
  db: DbOrTx,
  actor: Actor,
  now: Date,
): Promise<Result<{ rescored: number }>> {
  if (!can(actor, "settings.manage")) return err("FORBIDDEN", "No tienes permiso");
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNull(leads.deletedAt), eq(leads.isTest, false)));
  let rescored = 0;
  for (const row of rows) {
    const result = await scoreAndStore(db, row.id, now);
    if (result.ok && result.data) rescored++;
  }
  await writeAudit(db, {
    actorId: actor.id,
    action: "scoring.rescored",
    targetType: "scoring_model",
    targetId: String((await getActiveModel(db)).version),
    metadata: { rescored },
  });
  return ok({ rescored });
}

const qualificationInput = z.object({
  leadId: z.uuid(),
  companySize: z.preprocess(blank, z.enum(companySizes, "Tamaño inválido").optional()),
  budgetRange: z.preprocess(blank, z.enum(budgetRanges, "Presupuesto inválido").optional()),
  companyType: z.preprocess(blank, z.enum(companyTypes, "Tipo inválido").optional()),
});

// The seller completes what the prospect did not answer; the lead is graded again at once.
export async function updateLeadQualification(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof qualificationInput>,
  now: Date,
): Promise<Result<StoredScore | null>> {
  const parsed = qualificationInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { leadId, ...answers } = parsed.data;
  const [lead] = await db
    .select({ ownerId: leads.ownerId })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return err("NOT_FOUND", "Lead no encontrado");
  if (!can(actor, "leads.update_own", { ownerId: lead.ownerId })) {
    return err("FORBIDDEN", "Solo el dueño del lead puede calificarlo");
  }
  const values = {
    companySize: answers.companySize ?? null,
    budgetRange: answers.budgetRange ?? null,
    companyType: answers.companyType ?? null,
  };
  return db.transaction(async (tx) => {
    await tx.update(leads).set(values).where(eq(leads.id, leadId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "lead.qualification_updated",
      targetType: "lead",
      targetId: leadId,
      metadata: values,
    });
    return scoreAndStore(tx, leadId, now);
  });
}
