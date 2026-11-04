import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordInboundEvent } from "../src/capture/inbound.ts";
import { type ProcessDeps, processInbound } from "../src/capture/process-inbound.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { leads } from "../src/db/schema.ts";
import { parseTiktokLead, verifyTekinsofSignature } from "../src/integrations/tiktok.ts";

const secret = "tiktok-webhook-secret";

let db: Db;
let close: () => Promise<void>;

const deps: ProcessDeps = {
  meta: {
    fetch: (() => Promise.reject(new Error("sin red"))) as typeof fetch,
    graphVersion: "v24.0",
  },
  encryptionKey: randomBytes(32),
  now: () => new Date("2026-10-30T16:00:00Z"),
};

const body = (leadId: string, overrides: Record<string, unknown> = {}) => ({
  lead_id: leadId,
  form_id: "tt-form-1",
  form_name: "TikTok — Demo ERP",
  campaign_id: "tt-camp-1",
  ad_id: "tt-ad-1",
  adgroup_id: "tt-adgroup-1",
  created_time: 1761836400,
  fields: {
    name: "Carla Ríos",
    email: "carla@retail.pe",
    phone: "959926642",
    company: "Retail Sur",
    rubro: "Comercio",
  },
  ...overrides,
});

async function process(leadId: string, overrides: Record<string, unknown> = {}) {
  const recorded = await recordInboundEvent(db, {
    provider: "tiktok",
    eventType: "lead",
    externalId: leadId,
    payload: body(leadId, overrides),
    signatureValid: true,
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const result = await processInbound(db, deps, recorded.data.inboundEventId);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe("verifyTekinsofSignature", () => {
  const raw = JSON.stringify(body("tt-sig"));
  const sign = (text: string, key = secret) =>
    `sha256=${createHmac("sha256", key).update(text).digest("hex")}`;

  it("acepta el HMAC del cuerpo exacto", () => {
    expect(verifyTekinsofSignature(raw, sign(raw), secret)).toBe(true);
  });

  it("rechaza otro secreto, un byte cambiado o la cabecera ausente", () => {
    expect(verifyTekinsofSignature(raw, sign(raw, "otro"), secret)).toBe(false);
    expect(verifyTekinsofSignature(`${raw} `, sign(raw), secret)).toBe(false);
    expect(verifyTekinsofSignature(raw, null, secret)).toBe(false);
  });
});

describe("parseTiktokLead", () => {
  it("acepta created_time en segundos o ISO y rechaza una fecha inválida", () => {
    const seconds = parseTiktokLead(body("tt-a"));
    expect(seconds.ok && seconds.data.created_time.toISOString()).toBe("2025-10-30T15:00:00.000Z");
    const iso = parseTiktokLead(body("tt-b", { created_time: "2026-10-30T10:00:00-05:00" }));
    expect(iso.ok && iso.data.created_time.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    expect(parseTiktokLead(body("tt-c", { created_time: "ayer" })).ok).toBe(false);
  });
});

describe("processInbound (TikTok)", () => {
  it("crea el lead de TikTok y deja los campos desconocidos en raw_answers", async () => {
    const result = await process("tt-1");
    expect(result.status).toBe("procesado");
    const [row] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, result.leadId ?? ""));
    expect(row?.source).toBe("tiktok_lead_ads");
    expect(row?.adPlatform).toBe("tiktok");
    expect(row?.fullName).toBe("Carla Ríos");
    expect(row?.companyName).toBe("Retail Sur");
    expect(row?.adId).toBe("tt-ad-1");
    expect(row?.rawAnswers).toEqual({ rubro: "Comercio" });
  });

  it("el mismo lead_id dos veces deja un solo lead", async () => {
    const first = await process("tt-2");
    // A connector retry with a new delivery id would reach ingestion twice; dedup holds there too.
    const second = await process("tt-2-retry", { lead_id: "tt-2" });
    expect(second.leadId).toBe(first.leadId);
    const rows = await db.select().from(leads).where(eq(leads.externalLeadId, "tt-2"));
    expect(rows).toHaveLength(1);
  });

  it("un lead sin correo ni teléfono queda en error sin reintento", async () => {
    const result = await process("tt-3", { fields: { name: "Sin contacto" } });
    expect(result.status).toBe("error");
    expect(result.leadId).toBeNull();
  });
});
