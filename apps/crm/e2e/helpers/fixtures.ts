// Rows the E2E specs need that no screen creates yet. Runs once, after migrate and before
// `next start` (playwright.config.ts), against the same throwaway PGlite directory.
import { createDb } from "@tekinsof/core/db/client";
import { adForms, campaignSpendDaily, campaigns } from "@tekinsof/core/db/schema";
import { encryptSecret } from "@tekinsof/core/integrations/secrets";
import { limaDate } from "@tekinsof/core/time/business-hours";

// Shared with e2e/webhooks-google.spec.ts.
export const E2E_GOOGLE_FORM_ID = "00000000-0000-4000-8000-0000000e2e01";
export const E2E_GOOGLE_KEY = "e2e-google-form-key";
// Shared with e2e/spend.spec.ts: Meta spend the sync stored before anyone mapped the campaign.
export const E2E_META_CAMPAIGN = "120200000000000001";

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  const encryptionKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!url || !encryptionKey)
    throw new Error("fixtures: DATABASE_URL and INTEGRATIONS_ENCRYPTION_KEY");
  const { db, close } = createDb(url);
  await db
    .insert(adForms)
    .values({
      id: E2E_GOOGLE_FORM_ID,
      provider: "google_ads",
      externalFormId: "e2e-4455",
      name: "Google — E2E",
      webhookKeyEncrypted: encryptSecret(E2E_GOOGLE_KEY, Buffer.from(encryptionKey, "base64")),
    })
    .onConflictDoNothing();
  await db
    .insert(campaigns)
    .values({ name: "Campaña E2E Meta", slug: "campana-e2e-meta", channel: "meta_ads" })
    .onConflictDoNothing();
  const day = (ago: number) => limaDate(new Date(Date.now() - ago * 24 * 60 * 60 * 1000));
  const unmapped = { provider: "meta", externalCampaignId: E2E_META_CAMPAIGN, currency: "PEN" };
  await db
    .insert(campaignSpendDaily)
    .values([
      {
        ...unmapped,
        externalCampaignName: "Meta — Prospección ERP",
        adPlatform: "facebook",
        date: day(1),
        spendCents: 12345,
      },
      {
        ...unmapped,
        externalCampaignName: "Meta — Prospección ERP",
        adPlatform: "instagram",
        date: day(2),
        spendCents: 5000,
      },
    ])
    .onConflictDoNothing();
  await close();
  console.log("fixtures: done");
}
