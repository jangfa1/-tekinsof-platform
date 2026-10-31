import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import { leads, leadTouchpoints } from "../db/schema.ts";

// Where a prospect came from. Ad form leads know their platform; a site lead is placed by the
// click id or utm_source its visit carried, so a visit from an ad counts for that platform in the
// dashboard. Without any signal the lead is organic or direct (null).

export type AdPlatform = "facebook" | "instagram" | "google" | "tiktok";

export type AttributionSignals = {
  utmSource?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
};

export function platformFromAttribution(signals: AttributionSignals): AdPlatform | null {
  const source = signals.utmSource?.trim().toLowerCase() ?? "";
  const says = (pattern: RegExp) => pattern.test(source);
  if (signals.gclid) return "google";
  if (signals.ttclid) return "tiktok";
  // Instagram links carry an fbclid too, so its utm_source is checked first.
  if (says(/instagram|^ig$|^ig[_-]/)) return "instagram";
  if (signals.fbclid || says(/facebook|^fb$|^fb[_-]|^meta/)) return "facebook";
  if (says(/google|adwords/)) return "google";
  if (says(/tiktok/)) return "tiktok";
  return null;
}

export type Touchpoint = {
  source: string;
  adPlatform?: string | null;
  campaignId?: string | null;
  landingSlug?: string | null;
  adFormId?: string | null;
  adId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  referrer?: string | null;
};

// Call inside the transaction that creates the lead (isConversion = true), or when the same
// prospect comes back and is deduplicated onto it (false).
export async function recordTouchpoint(
  tx: DbOrTx,
  leadId: string,
  touch: Touchpoint,
  occurredAt: Date,
  isConversion: boolean,
): Promise<void> {
  await tx.insert(leadTouchpoints).values({
    leadId,
    occurredAt,
    isConversion,
    source: touch.source,
    adPlatform: touch.adPlatform ?? null,
    campaignId: touch.campaignId ?? null,
    landingSlug: touch.landingSlug ?? null,
    adFormId: touch.adFormId ?? null,
    adId: touch.adId ?? null,
    utmSource: touch.utmSource ?? null,
    utmMedium: touch.utmMedium ?? null,
    utmCampaign: touch.utmCampaign ?? null,
    utmTerm: touch.utmTerm ?? null,
    utmContent: touch.utmContent ?? null,
    gclid: touch.gclid ?? null,
    fbclid: touch.fbclid ?? null,
    ttclid: touch.ttclid ?? null,
    referrer: touch.referrer ?? null,
  });
}

// One-off after r2-11 ships (scripts/backfill-touchpoints.ts), safe to run again: every lead
// without touchpoints gets its creating one, and site leads get the platform of their visit.
export async function backfillTouchpoints(
  db: DbOrTx,
): Promise<{ touchpoints: number; platforms: number }> {
  const missing = await db
    .select()
    .from(leads)
    .where(
      sql`not exists (select 1 from ${leadTouchpoints} where ${leadTouchpoints.leadId} = ${leads.id})`,
    );
  let platforms = 0;
  for (const lead of missing) {
    const adPlatform = lead.adPlatform ?? platformFromAttribution(lead);
    await db.transaction(async (tx) => {
      if (adPlatform && !lead.adPlatform) {
        await tx.update(leads).set({ adPlatform }).where(eq(leads.id, lead.id));
        platforms++;
      }
      await recordTouchpoint(tx, lead.id, { ...lead, adPlatform }, lead.createdAt, true);
    });
  }
  return { touchpoints: missing.length, platforms };
}
