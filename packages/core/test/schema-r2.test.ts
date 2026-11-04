import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../src/db/client.ts";
import { DEFAULT_ORGANIZATION_ID, leads } from "../src/db/schema.ts";

// Release 2 step r2-01 (blueprints/tekinsof-release-2-marketing/blueprint.md).
const newTables = [
  "organizations",
  "integration_accounts",
  "inbound_events",
  "ad_forms",
  "campaign_spend_daily",
];

// Every table that holds an organization's business data. A new one must be added here.
const businessTables = [
  "companies",
  "contacts",
  "campaigns",
  "leads",
  "opportunities",
  "activities",
  "services",
  "quotes",
  "landing_pages",
  "conversations",
  "integration_accounts",
  "inbound_events",
  "ad_forms",
  "campaign_spend_daily",
];

const consent = { consentAt: new Date(), consentVersion: "meta-form" };

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

async function rejects(insert: Promise<unknown>, pattern: RegExp) {
  const error = await insert.then(
    () => null,
    (e: unknown) => e as { message?: string; cause?: { message?: string } },
  );
  expect(error).not.toBeNull();
  expect(`${error?.message} ${error?.cause?.message ?? ""}`).toMatch(pattern);
}

describe("esquema de la Release 2", () => {
  // Tests always run on PGlite, whose execute() result is { rows }.
  async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
    return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
  }

  it("crea las tablas nuevas", async () => {
    const result = await rows<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(result.map((row) => row.table_name));
    for (const table of newTables) expect(names, table).toContain(table);
  });

  it("toda tabla de negocio tiene organization_id no nulo", async () => {
    const result = await rows<{ table_name: string; is_nullable: string }>(
      sql`select table_name, is_nullable from information_schema.columns
          where table_schema = 'public' and column_name = 'organization_id'`,
    );
    const columns = new Map(result.map((row) => [row.table_name, row.is_nullable]));
    for (const table of businessTables) expect(columns.get(table), table).toBe("NO");
  });

  it("un lead sin organization_id recibe la organización por defecto", async () => {
    const [row] = await db
      .insert(leads)
      .values({ source: "manual", fullName: "Sin organización", email: "org@empresa.pe" })
      .returning({ organizationId: leads.organizationId });
    expect(row?.organizationId).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it("un lead de Meta sin consentimiento se rechaza", async () => {
    await rejects(
      db.insert(leads).values({
        source: "meta_lead_ads",
        fullName: "Sin consentimiento",
        email: "meta@empresa.pe",
      }),
      /ck_leads_public_consent/,
    );
  });

  it("el id externo es único por fuente y los nulos no chocan", async () => {
    const lead = { source: "google_lead_form", fullName: "Google", ...consent } as const;
    await db.insert(leads).values({ ...lead, email: "g1@empresa.pe", externalLeadId: "TL-1" });
    await rejects(
      db.insert(leads).values({ ...lead, email: "g2@empresa.pe", externalLeadId: "TL-1" }),
      /uq_leads_external|duplicate key/,
    );
    await db.insert(leads).values({ ...lead, email: "g3@empresa.pe" });
    await db.insert(leads).values({ ...lead, email: "g4@empresa.pe" });
  });

  it("ad_platform solo admite las plataformas conocidas", async () => {
    await rejects(
      db.insert(leads).values({
        source: "meta_lead_ads",
        fullName: "Plataforma rara",
        email: "rara@empresa.pe",
        adPlatform: "myspace",
        ...consent,
      }),
      /ck_leads_ad_platform/,
    );
  });
});
