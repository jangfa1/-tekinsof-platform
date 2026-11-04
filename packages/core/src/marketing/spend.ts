import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { campaignSpendDaily, campaigns } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

// Daily ad spend per campaign and platform (blueprint R2, step r2-10). Meta arrives through
// `spend-sync`; Google Ads and TikTok are typed in by Marketing until their APIs are connected.
// The dashboard reads leads, opportunities and won deals next to these rows to report CPL, CPO,
// conversion and ROI per platform, campaign, landing, seller and period.

export const spendPlatforms = ["facebook", "instagram", "google", "tiktok", "otra"] as const;
export type SpendPlatform = (typeof spendPlatforms)[number];
export const spendCurrencies = ["PEN", "USD"] as const;

// "123.45" → 12345 with integer arithmetic only; extra decimals round half up. null if malformed.
export function decimalToCents(value: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(value.trim().replace(/,/g, ""));
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(3, "0");
  const cents = Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  return whole * 100 + cents;
}

const day = z.iso.date("Fecha inválida");

const manualSpendInput = z.object({
  campaignId: z.uuid("Campaña inválida"),
  date: day,
  adPlatform: z.enum(spendPlatforms, "Plataforma inválida"),
  spendCents: z
    .number("Monto inválido")
    .int("Monto inválido")
    .min(0, "El monto no puede ser negativo")
    .max(100_000_000_00, "Monto demasiado alto"),
  currency: z.enum(spendCurrencies, "Moneda inválida"),
});

// One manual row per campaign, platform and day: recording the same day again corrects it.
export async function recordManualSpend(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof manualSpendInput>,
): Promise<Result<{ spendId: string }>> {
  if (!can(actor, "campaigns.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = manualSpendInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const spend = parsed.data;
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, spend.campaignId));
  if (!campaign) return err("NOT_FOUND", "Campaña no encontrada");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(campaignSpendDaily)
      .values({ ...spend, provider: "manual" })
      .onConflictDoUpdate({
        target: [
          campaignSpendDaily.campaignId,
          campaignSpendDaily.provider,
          campaignSpendDaily.adPlatform,
          campaignSpendDaily.date,
        ],
        targetWhere: sql`${campaignSpendDaily.externalCampaignId} is null`,
        set: { spendCents: spend.spendCents, currency: spend.currency, updatedAt: sql`now()` },
      })
      .returning({ id: campaignSpendDaily.id });
    if (!row) return err("INTERNAL", "No se pudo registrar el gasto");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "spend.recorded",
      targetType: "campaign",
      targetId: spend.campaignId,
      metadata: { ...spend },
    });
    return ok({ spendId: row.id });
  });
}

const mapInput = z.object({
  campaignId: z.uuid("Campaña inválida"),
  externalCampaignId: z
    .string()
    .trim()
    .regex(/^\d{1,30}$/, "El ID de campaña de Meta solo tiene números"),
});

type Refs = Record<string, string[]>;
const metaRefs = (refs: unknown) => ((refs ?? {}) as Refs).meta ?? [];

// Links a Meta campaign to a CRM campaign: its synced spend (including the days stored while it
// was unmapped) moves to the campaign at once, and future syncs land there directly.
export async function mapMetaCampaign(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof mapInput>,
): Promise<Result<{ attachedRows: number }>> {
  if (!can(actor, "campaigns.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = mapInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { campaignId, externalCampaignId } = parsed.data;
  const all = await db
    .select({ id: campaigns.id, name: campaigns.name, externalRefs: campaigns.externalRefs })
    .from(campaigns);
  const target = all.find((c) => c.id === campaignId);
  if (!target) return err("NOT_FOUND", "Campaña no encontrada");
  const owner = all.find((c) => metaRefs(c.externalRefs).includes(externalCampaignId));
  if (owner && owner.id !== campaignId) {
    return err("CONFLICT", `Esa campaña de Meta ya está asociada a «${owner.name}»`, {
      externalCampaignId: "Ya está asociada a otra campaña",
    });
  }

  return db.transaction(async (tx) => {
    const refs = (target.externalRefs ?? {}) as Refs;
    if (!owner) {
      await tx
        .update(campaigns)
        .set({ externalRefs: { ...refs, meta: [...metaRefs(refs), externalCampaignId] } })
        .where(eq(campaigns.id, campaignId));
    }
    const attached = await tx
      .update(campaignSpendDaily)
      .set({ campaignId, updatedAt: sql`now()` })
      .where(
        and(
          eq(campaignSpendDaily.provider, "meta"),
          eq(campaignSpendDaily.externalCampaignId, externalCampaignId),
        ),
      )
      .returning({ id: campaignSpendDaily.id });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "campaign.mapped",
      targetType: "campaign",
      targetId: campaignId,
      metadata: { provider: "meta", externalCampaignId, attachedRows: attached.length },
    });
    return ok({ attachedRows: attached.length });
  });
}

// Undoes a wrong mapping: the spend goes back to "sin asociar" instead of being deleted.
export async function unmapMetaCampaign(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof mapInput>,
): Promise<Result<{ detachedRows: number }>> {
  if (!can(actor, "campaigns.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = mapInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { campaignId, externalCampaignId } = parsed.data;
  const [campaign] = await db
    .select({ externalRefs: campaigns.externalRefs })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return err("NOT_FOUND", "Campaña no encontrada");
  const refs = (campaign.externalRefs ?? {}) as Refs;

  return db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({
        externalRefs: { ...refs, meta: metaRefs(refs).filter((id) => id !== externalCampaignId) },
      })
      .where(eq(campaigns.id, campaignId));
    const detached = await tx
      .update(campaignSpendDaily)
      .set({ campaignId: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(campaignSpendDaily.campaignId, campaignId),
          eq(campaignSpendDaily.externalCampaignId, externalCampaignId),
        ),
      )
      .returning({ id: campaignSpendDaily.id });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "campaign.unmapped",
      targetType: "campaign",
      targetId: campaignId,
      metadata: { provider: "meta", externalCampaignId },
    });
    return ok({ detachedRows: detached.length });
  });
}

export type UnmappedCampaign = {
  provider: string;
  externalCampaignId: string;
  name: string | null;
  spendCents: number;
  currency: string;
  firstDate: string;
  lastDate: string;
};

// Platform campaigns with synced spend that no CRM campaign claims yet (alert on /campanas).
export async function listUnmappedCampaigns(db: DbOrTx): Promise<UnmappedCampaign[]> {
  const rows = await db
    .select({
      provider: campaignSpendDaily.provider,
      externalCampaignId: campaignSpendDaily.externalCampaignId,
      name: sql<string | null>`max(${campaignSpendDaily.externalCampaignName})`,
      spendCents: sql<string>`sum(${campaignSpendDaily.spendCents})`,
      currency: sql<string>`max(${campaignSpendDaily.currency})`,
      firstDate: sql<string>`min(${campaignSpendDaily.date})`,
      lastDate: sql<string>`max(${campaignSpendDaily.date})`,
    })
    .from(campaignSpendDaily)
    .where(
      and(isNull(campaignSpendDaily.campaignId), isNotNull(campaignSpendDaily.externalCampaignId)),
    )
    .groupBy(campaignSpendDaily.provider, campaignSpendDaily.externalCampaignId)
    .orderBy(sql`max(${campaignSpendDaily.date}) desc`);
  return rows.map((row) => ({
    ...row,
    externalCampaignId: row.externalCampaignId ?? "",
    spendCents: Number(row.spendCents),
  }));
}

// Spend per campaign and currency from `since` (inclusive), for the campaign list.
export async function spendByCampaign(db: DbOrTx, since: string) {
  const rows = await db
    .select({
      campaignId: campaignSpendDaily.campaignId,
      currency: campaignSpendDaily.currency,
      spendCents: sql<string>`sum(${campaignSpendDaily.spendCents})`,
    })
    .from(campaignSpendDaily)
    .where(and(isNotNull(campaignSpendDaily.campaignId), gte(campaignSpendDaily.date, since)))
    .groupBy(campaignSpendDaily.campaignId, campaignSpendDaily.currency);
  return rows.map((row) => ({ ...row, spendCents: Number(row.spendCents) }));
}

export function listCampaignSpend(db: DbOrTx, campaignId: string, since: string) {
  return db
    .select()
    .from(campaignSpendDaily)
    .where(and(eq(campaignSpendDaily.campaignId, campaignId), gte(campaignSpendDaily.date, since)))
    .orderBy(desc(campaignSpendDaily.date), campaignSpendDaily.adPlatform);
}
