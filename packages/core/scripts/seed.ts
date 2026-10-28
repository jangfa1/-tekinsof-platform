// Idempotent seed: catalog (by code), Peruvian holidays (by date), app settings (by key) and, only
// when SEED_DEMO=1, a demo campaign with a published landing. Users are never seeded: the first one
// is CRM_BOOTSTRAP_ADMIN_EMAIL signing in with Microsoft (blueprint §4 Seed data).
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { landingBlocksSchema } from "../src/cms/block-schema.ts";
import { createDb } from "../src/db/client.ts";
import { appSettings, campaigns, holidays, landingPages, services } from "../src/db/schema.ts";
import { demoBlocks as demoContent, holidayRows, serviceRows } from "./seed-catalog.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("seed: DATABASE_URL is not set (export it or add it to the repository-root .env)");
  process.exit(1);
}

const demoBlocks = landingBlocksSchema.parse(demoContent);

const { db, close } = createDb(url);
try {
  await db
    .insert(services)
    .values(serviceRows)
    .onConflictDoUpdate({
      target: services.code,
      set: {
        name: sql`excluded.name`,
        slug: sql`excluded.slug`,
        category: sql`excluded.category`,
        summary: sql`excluded.summary`,
        isPublished: sql`excluded.is_published`,
        isFeatured: sql`excluded.is_featured`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
  await db.insert(holidays).values(holidayRows).onConflictDoNothing({ target: holidays.date });
  await db
    .insert(appSettings)
    .values([
      { key: "exchange_rate_default", value: { usdToPen: "3.7500" } },
      {
        key: "company_profile",
        value: {
          legalName: "Tekinsof Consulting",
          ruc: "",
          address: "Av. La Molina 145, Ate, Lima",
          email: "info@tekinsof.com",
          phone: "+51 981 053 022",
        },
      },
    ])
    .onConflictDoNothing({ target: appSettings.key });

  if (process.env.SEED_DEMO === "1") {
    await db
      .insert(campaigns)
      .values({ name: "Demo Google Ads", slug: "demo-google", channel: "google_ads" })
      .onConflictDoNothing({ target: campaigns.slug });
    await db
      .insert(landingPages)
      .values({
        slug: "demo-desarrollo-software",
        title: "Desarrollo de software a medida",
        status: "publicada",
        publishedAt: new Date(),
        campaignId: sql`(select id from campaigns where slug = 'demo-google')`,
        seoTitle: "Desarrollo de software a medida | Tekinsof Consulting",
        seoDescription: "Software a medida para empresas en Perú. Cuéntanos tu proyecto.",
        blocks: demoBlocks,
        whatsappMessage: "Hola Tekinsof, quiero información sobre desarrollo de software",
      })
      .onConflictDoNothing({ target: landingPages.slug });
  }
  console.log(
    `seed: ${serviceRows.length} services, ${holidayRows.length} holidays${process.env.SEED_DEMO === "1" ? ", demo landing" : ""}`,
  );
} finally {
  await close();
}
