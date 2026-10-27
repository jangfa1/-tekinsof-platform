import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  flushOutbox,
  quoteExpirySweep,
  requestSitePublish,
  type SweepDeps,
  slaSweep,
} from "../src/automation/sweeps.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { leads, opportunities, outbox, quotes, sitePublishes, users } from "../src/db/schema.ts";
import { createMailer } from "../src/integrations/graph.ts";

let db: Db;
let close: () => Promise<void>;
const mailer = createMailer({ driver: "log" });
const deps: SweepDeps = {
  mailer,
  systemSender: "notificaciones@tekinsof.com",
  crmBaseUrl: "http://localhost:3000",
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: "g1", name: "Gerencia Uno", email: "g1@tekinsof.com", role: "gerencia" },
    { id: "g2", name: "Gerencia Dos", email: "g2@tekinsof.com", role: "gerencia" },
    { id: "v1", name: "Vendedor", email: "v1@tekinsof.com", role: "ventas" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("slaSweep", () => {
  let leadId = "";

  beforeAll(async () => {
    // Monday 2026-11-02 10:00 Lima = 15:00 UTC → due at 14:00 Lima (19:00 UTC).
    const [row] = await db
      .insert(leads)
      .values({
        source: "manual",
        fullName: "Lead Lento",
        phone: "+51987654321",
        ownerId: "v1",
        createdAt: new Date("2026-11-02T15:00:00.000Z"),
      })
      .returning({ id: leads.id });
    if (!row) throw new Error("setup");
    leadId = row.id;
  });

  it("no alerta a las 13:59 de Lima", async () => {
    const result = await slaSweep(db, deps, new Date("2026-11-02T18:59:00.000Z"));
    expect(result).toEqual({ ok: true, data: { processed: 0 } });
    const [row] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(row?.slaAlertedAt).toBeNull();
    expect(row?.slaDueAt?.toISOString()).toBe("2026-11-02T19:00:00.000Z");
  });

  it("alerta a toda la Gerencia activa a las 14:01 de Lima", async () => {
    const before = mailer.outbox.length;
    const now = new Date("2026-11-02T19:01:00.000Z");
    const result = await slaSweep(db, deps, now);
    expect(result).toEqual({ ok: true, data: { processed: 1 } });
    const sent = mailer.outbox.slice(before);
    expect(sent.flatMap((m) => m.to).sort()).toEqual(["g1@tekinsof.com", "g2@tekinsof.com"]);
    expect(sent[0]?.subject).toBe("Lead sin atender: Lead Lento");
    const [row] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(row?.slaAlertedAt?.toISOString()).toBe(now.toISOString());
  });

  it("una segunda corrida con el mismo now procesa 0", async () => {
    const result = await slaSweep(db, deps, new Date("2026-11-02T19:01:00.000Z"));
    expect(result).toEqual({ ok: true, data: { processed: 0 } });
  });
});

describe("flushOutbox", () => {
  it("un envío que falla suma intentos y uno que funciona fija sent_at", async () => {
    const [row] = await db
      .insert(outbox)
      .values({ eventName: "test/event", payload: { n: 1 } })
      .returning({ id: outbox.id });
    if (!row) throw new Error("setup");
    const now = new Date("2026-11-02T20:00:00.000Z");

    await flushOutbox(db, { send: async () => Promise.reject(new Error("inngest down")) }, now);
    const [failed] = await db.select().from(outbox).where(eq(outbox.id, row.id));
    expect(failed?.attempts).toBe(1);
    expect(failed?.sentAt).toBeNull();
    expect(failed?.lastError).toBe("inngest down");

    const delivered: string[] = [];
    await flushOutbox(db, { send: async (e) => delivered.push(e.name) }, now);
    const [ok] = await db.select().from(outbox).where(eq(outbox.id, row.id));
    expect(ok?.sentAt?.toISOString()).toBe(now.toISOString());
    expect(delivered).toContain("test/event");
  });
});

describe("quoteExpirySweep", () => {
  it("una cotización enviada que venció ayer queda vencida", async () => {
    const [opportunity] = await db
      .insert(opportunities)
      .values({ title: "ERP", ownerId: "v1" })
      .returning({ id: opportunities.id });
    if (!opportunity) throw new Error("setup");
    const [quote] = await db
      .insert(quotes)
      .values({
        number: "COT-2026-0001",
        status: "enviada",
        opportunityId: opportunity.id,
        ownerId: "v1",
        exchangeRate: "3.7500",
        validUntil: "2026-11-01",
      })
      .returning({ id: quotes.id });
    if (!quote) throw new Error("setup");
    const result = await quoteExpirySweep(db, deps, new Date("2026-11-02T15:00:00.000Z"));
    expect(result.ok && result.data.processed).toBe(1);
    const [row] = await db.select().from(quotes).where(eq(quotes.id, quote.id));
    expect(row?.status).toBe("vencida");
  });
});

describe("requestSitePublish", () => {
  it("deja una fila en site_publishes y una en outbox", async () => {
    const id = await db.transaction((tx) =>
      requestSitePublish(tx, { requestedBy: "g1", reason: "landing publicada" }),
    );
    const publishes = await db.select().from(sitePublishes).where(eq(sitePublishes.id, id));
    expect(publishes[0]?.status).toBe("pendiente");
    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventName, "site/publish.requested"));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ sitePublishId: id });
  });
});
