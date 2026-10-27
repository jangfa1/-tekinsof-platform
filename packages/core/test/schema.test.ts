import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../src/db/client.ts";
import { auditEvents, leads, users } from "../src/db/schema.ts";

const tables = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "invitations",
  "app_settings",
  "holidays",
  "audit_events",
  "outbox",
  "companies",
  "contacts",
  "campaigns",
  "leads",
  "opportunities",
  "activities",
  "services",
  "quote_sequences",
  "quotes",
  "quote_items",
  "landing_pages",
  "site_publishes",
  "opportunity_services",
  "conversations",
  "messages",
];

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe("schema", () => {
  it.each(tables)("la tabla %s existe tras migrar", async (table) => {
    // Tests always run on PGlite, whose execute() result is { rows }.
    const result = (await db.execute(
      sql`select to_regclass(${`public.${table}`}) is not null as exists`,
    )) as unknown as { rows: Array<{ exists: boolean }> };
    expect(result.rows[0]?.exists).toBe(true);
  });

  it("rechaza un lead público sin consentimiento", async () => {
    await expect(
      db.insert(leads).values({ source: "web_form", fullName: "Ana", email: "ana@example.com" }),
    ).rejects.toThrow();
  });

  it("rechaza un lead sin email ni teléfono", async () => {
    await expect(
      db.insert(leads).values({ source: "manual", fullName: "Sin contacto" }),
    ).rejects.toThrow();
  });

  it("acepta un evento de auditoría con usuario", async () => {
    await db
      .insert(users)
      .values({ id: "u1", name: "Gerencia", email: "g@tekinsof.com", role: "gerencia" });
    const [row] = await db
      .insert(auditEvents)
      .values({ actorId: "u1", action: "user.invited", targetType: "user", targetId: "u2" })
      .returning();
    expect(row?.action).toBe("user.invited");
    expect(row?.metadata).toEqual({});
  });
});
