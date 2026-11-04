// Rows the E2E specs need that no screen creates yet. Runs once, after migrate and before
// `next start` (playwright.config.ts), against the same throwaway PGlite directory.
import { createDb } from "@tekinsof/core/db/client";
import { adForms, campaignSpendDaily, campaigns, leads } from "@tekinsof/core/db/schema";
import { encryptSecret } from "@tekinsof/core/integrations/secrets";
import { limaDate } from "@tekinsof/core/time/business-hours";

// Shared with e2e/webhooks-google.spec.ts.
export const E2E_GOOGLE_FORM_ID = "00000000-0000-4000-8000-0000000e2e01";
export const E2E_GOOGLE_KEY = "e2e-google-form-key";
// Shared with e2e/spend.spec.ts: Meta spend the sync stored before anyone mapped the campaign.
export const E2E_META_CAMPAIGN = "120200000000000001";
// Shared with e2e/marketing.spec.ts: September 2026 is a fixed month only this fixture fills.
export const E2E_DASHBOARD_MONTH = { desde: "2026-09-01", hasta: "2026-09-30" };

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
  // Dashboard month: Instagram 3 leads / S/ 90 (CPL S/ 30), Facebook 2 / S/ 40 (CPL S/ 20),
  // Google 1 lead without spend.
  const [dashboard] = await db
    .insert(campaigns)
    .values({ name: "Campaña E2E Dashboard", slug: "campana-e2e-dashboard", channel: "meta_ads" })
    .onConflictDoNothing()
    .returning({ id: campaigns.id });
  if (dashboard) {
    const lead = (adPlatform: string, n: number) => ({
      fullName: `Dashboard ${adPlatform} ${n}`,
      source: "manual",
      phone: `+5190000${adPlatform.length}${n}0`,
      adPlatform,
      campaignId: dashboard.id,
      createdAt: new Date(`2026-09-1${n}T15:00:00Z`),
    });
    await db
      .insert(leads)
      .values([
        lead("instagram", 1),
        lead("instagram", 2),
        lead("instagram", 3),
        lead("facebook", 1),
        lead("facebook", 2),
        lead("google", 1),
      ]);
    const spend = {
      campaignId: dashboard.id,
      provider: "manual",
      date: "2026-09-10",
      currency: "PEN",
    };
    await db.insert(campaignSpendDaily).values([
      { ...spend, adPlatform: "instagram", spendCents: 9000 },
      { ...spend, adPlatform: "facebook", spendCents: 4000 },
    ]);
  }
  await close();
  console.log("fixtures: done");
}
