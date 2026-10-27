import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleLeadCreated, type LeadCreatedDeps } from "../src/automation/lead-created.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { leads, users } from "../src/db/schema.ts";
import { createMailer, type Mailer } from "../src/integrations/graph.ts";
import { err } from "../src/result.ts";

let db: Db;
let close: () => Promise<void>;
let clock = Date.parse("2026-11-02T15:00:00.000Z");
const now = () => {
  clock += 60_000;
  return new Date(clock);
};

const mailer = createMailer({ driver: "log" });
const deps = (overrides: Partial<LeadCreatedDeps> = {}): LeadCreatedDeps => ({
  mailer,
  systemSender: "notificaciones@tekinsof.com",
  crmBaseUrl: "http://localhost:3000",
  now,
  ...overrides,
});

async function webLead(name: string): Promise<string> {
  const [row] = await db
    .insert(leads)
    .values({
      source: "web_form",
      fullName: name,
      email: `${name.toLowerCase()}@prospecto.pe`,
      consentAt: new Date(),
      consentVersion: "2026-10",
    })
    .returning({ id: leads.id });
  if (!row) throw new Error("setup");
  return row.id;
}

async function ownerOf(leadId: string) {
  const [row] = await db.select({ ownerId: leads.ownerId }).from(leads).where(eq(leads.id, leadId));
  return row?.ownerId;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: "a", name: "Vendedora A", email: "a@tekinsof.com", role: "ventas" },
    {
      id: "b",
      name: "Vendedor B",
      email: "b@tekinsof.com",
      role: "ventas",
      lastAssignedAt: new Date("2026-11-01T15:00:00.000Z"),
    },
    { id: "g", name: "Gerencia", email: "g@tekinsof.com", role: "gerencia" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("handleLeadCreated", () => {
  let first = "";

  it("rota tres leads como A, B, A", async () => {
    first = await webLead("Uno");
    const second = await webLead("Dos");
    const third = await webLead("Tres");
    for (const id of [first, second, third]) {
      const result = await handleLeadCreated(db, deps(), id);
      expect(result.ok && result.data.notified).toBe(true);
    }
    expect([await ownerOf(first), await ownerOf(second), await ownerOf(third)]).toEqual([
      "a",
      "b",
      "a",
    ]);
  });

  it("procesar otra vez el primer lead no cambia el dueño ni envía correos", async () => {
    const before = mailer.outbox.length;
    const result = await handleLeadCreated(db, deps(), first);
    expect(result.ok && result.data.ownerId).toBe("a");
    expect(mailer.outbox.length).toBe(before);
  });

  it("el acuse sale del buzón de A hacia el prospecto", async () => {
    const ack = mailer.outbox.find((m) => m.to.includes("uno@prospecto.pe"));
    expect(ack?.from).toBe("a@tekinsof.com");
    expect(ack?.replyTo).toBe("a@tekinsof.com");
    const notice = mailer.outbox.find((m) => m.subject === "Nuevo lead: Uno");
    expect(notice?.from).toBe("notificaciones@tekinsof.com");
    expect(notice?.to).toEqual(["a@tekinsof.com"]);
  });

  it("un fallo del correo mantiene la asignación con notified false", async () => {
    const failing: Mailer = {
      outbox: [],
      send: async () => err("INTERNAL", "Graph sendMail 500"),
      getAccountEnabled: async () => err("INTERNAL", "down"),
    };
    const id = await webLead("Cuatro");
    const result = await handleLeadCreated(db, deps({ mailer: failing }), id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.notified).toBe(false);
      expect(result.data.acknowledged).toBe(false);
    }
    expect(await ownerOf(id)).not.toBeNull();
  });

  it("sin vendedores activos el lead queda para gerencia", async () => {
    await db
      .update(users)
      .set({ isActive: false })
      .where(inArray(users.id, ["a", "b"]));
    const id = await webLead("Cinco");
    const result = await handleLeadCreated(db, deps(), id);
    expect(result.ok && result.data.ownerId).toBe("g");
    const ack = mailer.outbox.find((m) => m.to.includes("cinco@prospecto.pe"));
    expect(ack?.from).toBe("notificaciones@tekinsof.com");
  });

  it("un lead inexistente es NOT_FOUND", async () => {
    const result = await handleLeadCreated(db, deps(), "00000000-0000-4000-8000-000000000000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
