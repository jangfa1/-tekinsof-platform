import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { campaigns, leads, outbox, users } from "../src/db/schema.ts";
import { addActivity } from "../src/leads/activities.ts";
import { changeLeadStatus, createManualLead, createPublicLead } from "../src/leads/leads.ts";

const ventasA: Actor = { id: "va", email: "va@tekinsof.com", role: "ventas" };
const ventasB: Actor = { id: "vb", email: "vb@tekinsof.com", role: "ventas" };

const base = {
  fullName: "Ana Torres",
  consent: true as const,
  consentVersion: "2026-10",
  turnstileToken: "token",
  website: "",
};

let db: Db;
let close: () => Promise<void>;
let campaignId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: ventasA.id, name: "Vendedora A", email: ventasA.email, role: "ventas" },
    { id: ventasB.id, name: "Vendedor B", email: ventasB.email, role: "ventas" },
  ]);
  const [campaign] = await db
    .insert(campaigns)
    .values({ name: "Google ERP Q4", slug: "google-erp-q4", channel: "google_ads" })
    .returning({ id: campaigns.id });
  if (!campaign) throw new Error("setup");
  campaignId = campaign.id;
});
afterAll(async () => {
  await close();
});

async function leadRow(id: string) {
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}

describe("createPublicLead", () => {
  it("resuelve la campaña por campaignSlug y escribe un outbox", async () => {
    const result = await createPublicLead(db, {
      ...base,
      email: "Ana@Empresa.pe",
      campaignSlug: "google-erp-q4",
      landingSlug: "erp-integracion-q4",
    });
    expect(result.ok && result.data.deduplicated).toBe(false);
    if (!result.ok || !result.data.leadId) throw new Error("lead");
    const row = await leadRow(result.data.leadId);
    expect(row?.campaignId).toBe(campaignId);
    expect(row?.source).toBe("landing");
    expect(row?.email).toBe("ana@empresa.pe");
    expect(row?.consentAt).not.toBeNull();
  });

  it("deduplica el mismo correo en 24 h sin nuevo outbox", async () => {
    const first = await createPublicLead(db, { ...base, email: "dup@empresa.pe" });
    const second = await createPublicLead(db, { ...base, email: "DUP@empresa.pe" });
    if (!first.ok || !second.ok) throw new Error("lead");
    expect(second.data).toEqual({ leadId: first.data.leadId, deduplicated: true });
    const events = await db
      .select()
      .from(outbox)
      .where(
        and(
          eq(outbox.eventName, "lead/created"),
          eq(outbox.payload, { leadId: first.data.leadId }),
        ),
      );
    expect(events).toHaveLength(1);
  });

  it("guarda los click ids de Google, Meta y TikTok", async () => {
    const result = await createPublicLead(db, {
      ...base,
      email: "clicks@empresa.pe",
      gclid: "gclid-1",
      fbclid: "fbclid-1",
      ttclid: "E.C.P.ttclid-1",
    });
    if (!result.ok || !result.data.leadId) throw new Error("lead");
    const row = await leadRow(result.data.leadId);
    expect(row).toMatchObject({ gclid: "gclid-1", fbclid: "fbclid-1", ttclid: "E.C.P.ttclid-1" });
  });

  it("el honeypot no escribe nada", async () => {
    const result = await createPublicLead(db, { ...base, email: "bot@spam.pe", website: "x" });
    expect(result).toEqual({ ok: true, data: { leadId: null, deduplicated: false } });
    const rows = await db.select().from(leads).where(eq(leads.email, "bot@spam.pe"));
    expect(rows).toHaveLength(0);
  });

  it("sin consentimiento es VALIDATION_ERROR en fields.consent", async () => {
    const result = await createPublicLead(db, {
      ...base,
      email: "x@empresa.pe",
      consent: false as unknown as true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.consent).toBeDefined();
  });
});

describe("estados y actividades", () => {
  it("nuevo → convertido es INVALID_TRANSITION", async () => {
    const created = await createManualLead(db, ventasA, { fullName: "Luis", phone: "987654321" });
    if (!created.ok) throw new Error("lead");
    const result = await changeLeadStatus(db, ventasA, {
      leadId: created.data.leadId,
      to: "convertido",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("descartar sin motivo es VALIDATION_ERROR", async () => {
    const created = await createManualLead(db, ventasA, { fullName: "Rosa", phone: "987654322" });
    if (!created.ok) throw new Error("lead");
    const result = await changeLeadStatus(db, ventasA, {
      leadId: created.data.leadId,
      to: "descartado",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.reason).toBe("Indica el motivo");
  });

  it("un ventas no cambia el estado del lead de otro vendedor", async () => {
    const created = await createManualLead(db, ventasA, { fullName: "Pedro", phone: "987654323" });
    if (!created.ok) throw new Error("lead");
    const result = await changeLeadStatus(db, ventasB, {
      leadId: created.data.leadId,
      to: "contactado",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("una llamada sobre un lead nuevo lo pasa a contactado", async () => {
    const created = await createManualLead(db, ventasA, { fullName: "Carla", phone: "987654324" });
    if (!created.ok) throw new Error("lead");
    const result = await addActivity(db, ventasA, {
      type: "llamada",
      subject: "Primera llamada",
      leadId: created.data.leadId,
    });
    expect(result.ok).toBe(true);
    const row = await leadRow(created.data.leadId);
    expect(row?.status).toBe("contactado");
    expect(row?.firstContactedAt).not.toBeNull();
  });

  it("el lead manual de un ventas queda con él como dueño y origen whatsapp", async () => {
    const created = await createManualLead(db, ventasB, {
      fullName: "Mario",
      phone: "987 654 325",
    });
    if (!created.ok) throw new Error("lead");
    const row = await leadRow(created.data.leadId);
    expect(row?.ownerId).toBe(ventasB.id);
    expect(row?.source).toBe("whatsapp");
    expect(row?.phone).toBe("+51987654325");
  });
});
