import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import { requestSitePublish } from "../automation/sweeps.ts";
import type { DbOrTx } from "../db/client.ts";
import { campaigns, landingPages } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { kebab, landingBlocksSchema, line } from "./block-schema.ts";

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
const channels = [
  "google_ads",
  "meta_ads",
  "linkedin_ads",
  "tiktok_ads",
  "seo",
  "email",
  "whatsapp",
  "referral",
  "event",
  "other",
] as const;

export const campaignInput = z.object({
  name: line(),
  slug: kebab.max(80),
  channel: z.enum(channels, "Canal inválido"),
  startsOn: z.preprocess(blank, z.iso.date().optional()),
  endsOn: z.preprocess(blank, z.iso.date().optional()),
  budgetCents: z.number().int().min(0).optional(),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
});

export async function createCampaign(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof campaignInput>,
): Promise<Result<{ campaignId: string }>> {
  if (!can(actor, "campaigns.write")) return err("FORBIDDEN", "Sin permiso");
  const parsed = campaignInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const [clash] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.slug, parsed.data.slug));
  if (clash)
    return err("CONFLICT", "Ya existe una campaña con ese slug", { slug: "Ya está en uso" });
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(campaigns).values(parsed.data).returning({ id: campaigns.id });
    if (!row) return err("INTERNAL", "No se pudo crear la campaña");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "campaign.created",
      targetType: "campaign",
      targetId: row.id,
      metadata: { slug: parsed.data.slug },
    });
    return ok({ campaignId: row.id });
  });
}

export function listCampaigns(db: DbOrTx) {
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export const landingInput = z.object({
  id: z.preprocess(blank, z.uuid().optional()),
  slug: kebab.max(80),
  title: line(120),
  campaignId: z.preprocess(blank, z.uuid().optional()),
  seoTitle: z.preprocess(blank, z.string().trim().max(70).optional()),
  seoDescription: z.preprocess(blank, z.string().trim().max(160).optional()),
  blocks: landingBlocksSchema,
  whatsappMessage: z.preprocess(blank, z.string().trim().max(300).optional()),
});

export async function saveLanding(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof landingInput>,
): Promise<Result<{ landingId: string }>> {
  if (!can(actor, "landings.write")) return err("FORBIDDEN", "Sin permiso");
  const parsed = landingInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...data } = parsed.data;
  const [clash] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(eq(landingPages.slug, data.slug), id ? sql`${landingPages.id} <> ${id}` : undefined),
    );
  if (clash)
    return err("CONFLICT", "Ya existe una landing con ese slug", { slug: "Ya está en uso" });
  const values = { ...data, campaignId: data.campaignId ?? null, updatedBy: actor.id };
  return db.transaction(async (tx) => {
    const [row] = id
      ? await tx
          .update(landingPages)
          .set(values)
          .where(eq(landingPages.id, id))
          .returning({ id: landingPages.id })
      : await tx.insert(landingPages).values(values).returning({ id: landingPages.id });
    if (!row) return err("NOT_FOUND", "Landing no encontrada");
    await writeAudit(tx, {
      actorId: actor.id,
      action: id ? "landing.updated" : "landing.created",
      targetType: "landing",
      targetId: row.id,
      metadata: { slug: data.slug },
    });
    return ok({ landingId: row.id });
  });
}

async function changeStatus(
  db: DbOrTx,
  actor: Actor,
  id: string,
  status: "publicada" | "archivada",
): Promise<Result<{ landingId: string; sitePublishId: string }>> {
  if (!can(actor, "landings.publish")) return err("FORBIDDEN", "Sin permiso");
  const landing = await getLanding(db, id);
  if (!landing) return err("NOT_FOUND", "Landing no encontrada");
  if (status === "publicada") {
    const blocks = landingBlocksSchema.safeParse(landing.blocks);
    if (!blocks.success) return validationError(blocks.error);
  }
  return db.transaction(async (tx) => {
    await tx
      .update(landingPages)
      .set(
        status === "publicada"
          ? { status, publishedAt: new Date(), updatedBy: actor.id }
          : { status, updatedBy: actor.id },
      )
      .where(eq(landingPages.id, id));
    const sitePublishId = await requestSitePublish(tx, {
      requestedBy: actor.id,
      reason: `landing:${landing.slug}`,
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: status === "publicada" ? "landing.published" : "landing.archived",
      targetType: "landing",
      targetId: id,
      metadata: { slug: landing.slug },
    });
    return ok({ landingId: id, sitePublishId });
  });
}

export const publishLanding = (db: DbOrTx, actor: Actor, id: string) =>
  changeStatus(db, actor, id, "publicada");
export const archiveLanding = (db: DbOrTx, actor: Actor, id: string) =>
  changeStatus(db, actor, id, "archivada");

export function listLandings(db: DbOrTx) {
  return db
    .select({
      id: landingPages.id,
      slug: landingPages.slug,
      title: landingPages.title,
      status: landingPages.status,
      publishedAt: landingPages.publishedAt,
      campaignName: campaigns.name,
    })
    .from(landingPages)
    .leftJoin(campaigns, eq(landingPages.campaignId, campaigns.id))
    .orderBy(desc(landingPages.updatedAt));
}

export async function getLanding(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(landingPages).where(eq(landingPages.id, id));
  return row ?? null;
}

// For the site build: published landings with their campaign slug (blocks are validated there).
export function listPublishedLandings(db: DbOrTx) {
  return db
    .select({
      slug: landingPages.slug,
      title: landingPages.title,
      seoTitle: landingPages.seoTitle,
      seoDescription: landingPages.seoDescription,
      blocks: landingPages.blocks,
      whatsappMessage: landingPages.whatsappMessage,
      campaignSlug: campaigns.slug,
    })
    .from(landingPages)
    .leftJoin(campaigns, eq(landingPages.campaignId, campaigns.id))
    .where(eq(landingPages.status, "publicada"))
    .orderBy(asc(landingPages.slug));
}
