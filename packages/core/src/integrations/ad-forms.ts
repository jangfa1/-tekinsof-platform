import { randomBytes, randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { adForms, campaigns, leads } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import type { IntegrationDeps } from "./accounts.ts";
import { leadTargets } from "./meta.ts";
import { encryptSecret } from "./secrets.ts";

// Ad forms: Google ones are created here (each gets its own webhook URL and key); Meta and TikTok
// forms register themselves on their first lead and are mapped to a campaign afterwards.

const blankToNull = (value: unknown) => (value === "" ? null : value);
const campaignRef = z.preprocess(blankToNull, z.uuid("Campaña inválida").nullable()).default(null);

const createGoogleInput = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para el formulario").max(160),
  campaignId: campaignRef,
});

export type CreatedGoogleForm = { adFormId: string; webhookUrl: string; key: string };

// The key is returned once, here; afterwards only its sealed form exists.
export async function createGoogleAdForm(
  db: DbOrTx,
  actor: Actor,
  deps: IntegrationDeps & { crmBaseUrl: string },
  input: z.input<typeof createGoogleInput>,
): Promise<Result<CreatedGoogleForm>> {
  if (!can(actor, "integrations.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = createGoogleInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { name, campaignId } = parsed.data;

  const adFormId = randomUUID();
  const key = randomBytes(24).toString("base64url");
  return db.transaction(async (tx) => {
    await tx.insert(adForms).values({
      id: adFormId,
      organizationId: deps.organizationId,
      provider: "google_ads",
      // Google sends its own form id in every lead; until then the row is known by ours.
      externalFormId: adFormId,
      name,
      campaignId,
      webhookKeyEncrypted: encryptSecret(key, deps.encryptionKey),
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "integration.ad_form_created",
      targetType: "ad_form",
      targetId: adFormId,
      metadata: { provider: "google_ads", name, campaignId },
    });
    const base = deps.crmBaseUrl.replace(/\/$/, "");
    return ok({ adFormId, webhookUrl: `${base}/api/webhooks/google-leads/${adFormId}`, key });
  });
}

const mapInput = z.object({
  adFormId: z.uuid("Formulario inválido"),
  campaignId: campaignRef,
  fieldMapping: z
    .record(z.string().trim().min(1).max(200), z.enum(leadTargets as [string, ...string[]]))
    .optional(),
});

export async function mapAdForm(
  db: DbOrTx,
  actor: Actor,
  deps: Pick<IntegrationDeps, "organizationId">,
  input: z.input<typeof mapInput>,
): Promise<Result<{ adFormId: string }>> {
  if (!can(actor, "campaigns.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = mapInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { adFormId, campaignId, fieldMapping } = parsed.data;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(adForms)
      .set({ campaignId, ...(fieldMapping ? { fieldMapping } : {}), updatedAt: sql`now()` })
      .where(and(eq(adForms.id, adFormId), eq(adForms.organizationId, deps.organizationId)))
      .returning({ id: adForms.id });
    if (!row) return err("NOT_FOUND", "Formulario no encontrado");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "ad_form.mapped",
      targetType: "ad_form",
      targetId: row.id,
      metadata: { campaignId, fields: fieldMapping ? Object.keys(fieldMapping).length : null },
    });
    return ok({ adFormId: row.id });
  });
}

export type AdFormRow = {
  id: string;
  provider: string;
  name: string;
  externalFormId: string;
  campaignId: string | null;
  campaignName: string | null;
  isActive: boolean;
  hasKey: boolean;
  leadCount: number;
  createdAt: Date;
};

export async function listAdForms(db: DbOrTx, organizationId: string): Promise<AdFormRow[]> {
  const leadCounts = db
    .select({ adFormId: leads.adFormId, total: count().as("total") })
    .from(leads)
    .where(eq(leads.isTest, false))
    .groupBy(leads.adFormId)
    .as("lead_counts");
  const rows = await db
    .select({
      id: adForms.id,
      provider: adForms.provider,
      name: adForms.name,
      externalFormId: adForms.externalFormId,
      campaignId: adForms.campaignId,
      campaignName: campaigns.name,
      isActive: adForms.isActive,
      hasKey: sql<boolean>`${adForms.webhookKeyEncrypted} is not null`,
      leadCount: sql<number>`coalesce(${leadCounts.total}, 0)::int`,
      createdAt: adForms.createdAt,
    })
    .from(adForms)
    .leftJoin(campaigns, eq(campaigns.id, adForms.campaignId))
    .leftJoin(leadCounts, eq(leadCounts.adFormId, adForms.id))
    .where(eq(adForms.organizationId, organizationId))
    .orderBy(desc(adForms.createdAt));
  return rows.map((row) => ({ ...row, leadCount: Number(row.leadCount) }));
}
