import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhonePe } from "../crm/accounts.ts";
import type { DbOrTx } from "../db/client.ts";
import { adForms, campaigns, leads, outbox } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { qualificationFromAnswers } from "../scoring/normalize.ts";
import { type InboundProvider, inboundProviders } from "./inbound.ts";

// One entry point for every ad platform lead (Meta — Facebook and Instagram —, TikTok, Google).
// Each adapter turns its payload into an ExternalLead; this module owns deduplication, form
// discovery, campaign resolution and the `lead/created` event (blueprint R2, step r2-02).

const sources: Record<InboundProvider, "meta_lead_ads" | "tiktok_lead_ads" | "google_lead_form"> = {
  meta: "meta_lead_ads",
  tiktok: "tiktok_lead_ads",
  google_ads: "google_lead_form",
};

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());
const text = (max: number) => z.string().trim().max(max);

export const externalLeadInput = z
  .object({
    provider: z.enum(inboundProviders),
    externalLeadId: text(200).min(1),
    externalFormId: text(200).min(1),
    formName: opt(text(160)),
    campaignExternalId: opt(text(200)),
    adId: opt(text(200)),
    adsetId: opt(text(200)),
    adPlatform: z.enum(["facebook", "instagram", "tiktok", "google"]),
    fullName: opt(text(120)),
    email: opt(z.email().trim().toLowerCase()),
    phone: opt(text(30)),
    companyName: opt(text(160)),
    jobTitle: opt(text(120)),
    message: opt(text(2000)),
    gclid: opt(text(500)),
    rawAnswers: z.record(z.string(), z.string()).default({}),
    submittedAt: z.coerce.date(),
    isTest: z.boolean().default(false),
  })
  .refine((lead) => Boolean(lead.email || lead.phone), {
    message: "El lead no trae correo ni teléfono",
    path: ["email"],
  });

export type ExternalLead = z.input<typeof externalLeadInput>;

type Ingested = Result<{ leadId: string; duplicate: boolean }>;

async function findExisting(db: DbOrTx, source: string, externalLeadId: string) {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.source, source), eq(leads.externalLeadId, externalLeadId)));
  return row;
}

// Unknown forms are registered on first sight (no campaign = "sin mapear") for Marketing to review.
async function resolveAdForm(
  db: DbOrTx,
  lead: { provider: InboundProvider; externalFormId: string; formName?: string },
) {
  const where = and(
    eq(adForms.provider, lead.provider),
    eq(adForms.externalFormId, lead.externalFormId),
  );
  const columns = { id: adForms.id, campaignId: adForms.campaignId };
  const [known] = await db.select(columns).from(adForms).where(where);
  if (known) return known;
  await db
    .insert(adForms)
    .values({
      provider: lead.provider,
      externalFormId: lead.externalFormId,
      name: lead.formName ?? `Formulario ${lead.externalFormId}`,
    })
    .onConflictDoNothing();
  const [created] = await db.select(columns).from(adForms).where(where);
  return created;
}

// `campaigns.external_refs` = { "<provider>": ["<platform campaign id>", …] }.
async function campaignByExternalId(db: DbOrTx, provider: InboundProvider, externalId: string) {
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      sql`${campaigns.externalRefs} @> jsonb_build_object(${provider}::text, jsonb_build_array(${externalId}::text))`,
    )
    .limit(1);
  return row?.id ?? null;
}

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
};

export async function ingestExternalLead(db: DbOrTx, input: ExternalLead): Promise<Ingested> {
  const parsed = externalLeadInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const lead = parsed.data;
  const source = sources[lead.provider];

  const existing = await findExisting(db, source, lead.externalLeadId);
  if (existing) return ok({ leadId: existing.id, duplicate: true });

  const form = await resolveAdForm(db, lead);
  const campaignId =
    form?.campaignId ??
    (lead.campaignExternalId
      ? await campaignByExternalId(db, lead.provider, lead.campaignExternalId)
      : null);
  const rawAnswers = lead.jobTitle
    ? { ...lead.rawAnswers, job_title: lead.jobTitle }
    : lead.rawAnswers;

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(leads)
        .values({
          source,
          campaignId,
          adFormId: form?.id ?? null,
          externalLeadId: lead.externalLeadId,
          adId: lead.adId,
          adsetId: lead.adsetId,
          adPlatform: lead.adPlatform,
          // Forms may omit the name; the lead still needs one to be listed.
          fullName: lead.fullName ?? lead.email ?? lead.phone ?? "Sin nombre",
          email: lead.email,
          // A paid lead is never dropped over a phone format the normalizer does not know.
          phone: lead.phone ? (normalizePhonePe(lead.phone) ?? lead.phone) : null,
          companyName: lead.companyName,
          message: lead.message,
          gclid: lead.gclid,
          rawAnswers,
          ...qualificationFromAnswers(lead.rawAnswers),
          isTest: lead.isTest,
          consentAt: lead.submittedAt,
          consentVersion: `${lead.provider}-form`,
        })
        .returning({ id: leads.id });
      if (!row) return err("INTERNAL", "No se pudo registrar el lead");
      // Platform test leads are kept for troubleshooting but never assigned or announced.
      if (!lead.isTest) {
        await tx.insert(outbox).values({ eventName: "lead/created", payload: { leadId: row.id } });
      }
      return ok({ leadId: row.id, duplicate: false });
    });
  } catch (error) {
    // Two deliveries of the same lead raced past findExisting; the unique index kept one.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findExisting(db, source, lead.externalLeadId);
    if (!winner) throw error;
    return ok({ leadId: winner.id, duplicate: true });
  }
}
