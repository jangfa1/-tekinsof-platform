import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ProcessDeps, processInbound } from "../src/capture/process-inbound.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { adForms, inboundEvents, leads, outbox } from "../src/db/schema.ts";
import {
  parseGoogleLead,
  receiveGoogleLead,
  toExternalLead,
  verifyGoogleKey,
} from "../src/integrations/google-leads.ts";
import { encryptSecret } from "../src/integrations/secrets.ts";

const key = randomBytes(32);
const GOOGLE_KEY = "clave-del-formulario-google";

let db: Db;
let close: () => Promise<void>;
let adFormId: string;

const deps: ProcessDeps = {
  meta: {
    fetch: (() => Promise.reject(new Error("sin red"))) as typeof fetch,
    graphVersion: "v24.0",
  },
  encryptionKey: key,
  now: () => new Date("2026-10-30T16:00:00Z"),
};

const body = (leadId: string, overrides: Record<string, unknown> = {}) => ({
  lead_id: leadId,
  api_version: "1.0",
  form_id: 4455,
  campaign_id: 7788,
  adgroup_id: 99,
  creative_id: 1234,
  gcl_id: "gclid-abc",
  google_key: GOOGLE_KEY,
  is_test: false,
  lead_submit_time: "2026-10-30 10:00:00-05:00",
  user_column_data: [
    { column_name: "Nombre completo", string_value: "Rosa Huamán", column_id: "FULL_NAME" },
    { column_name: "Correo", string_value: "rosa@minera.pe", column_id: "EMAIL" },
    { column_name: "Teléfono", string_value: "+51 959 926 642", column_id: "PHONE_NUMBER" },
    { column_name: "¿Cuántos usuarios?", string_value: "50", column_id: "QUESTION_USERS" },
  ],
  ...overrides,
});

async function eventsFor(leadId: string) {
  return db
    .select()
    .from(inboundEvents)
    .where(and(eq(inboundEvents.provider, "google_ads"), eq(inboundEvents.externalId, leadId)));
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [form] = await db
    .insert(adForms)
    .values({
      provider: "google_ads",
      externalFormId: "4455",
      name: "Google — Demo ERP",
      webhookKeyEncrypted: encryptSecret(GOOGLE_KEY, key),
    })
    .returning({ id: adForms.id });
  if (!form) throw new Error("form");
  adFormId = form.id;
});
afterAll(async () => {
  await close();
});

describe("parseGoogleLead + toExternalLead", () => {
  it("mapea FULL_NAME, EMAIL y PHONE_NUMBER y guarda la columna desconocida en rawAnswers", () => {
    const parsed = parseGoogleLead(body("g-map"));
    if (!parsed.ok) throw new Error("parse");
    const lead = toExternalLead(parsed.data, { externalFormId: "4455", mapping: {} }, new Date());
    expect(lead.fullName).toBe("Rosa Huamán");
    expect(lead.email).toBe("rosa@minera.pe");
    expect(lead.phone).toBe("+51 959 926 642");
    expect(lead.rawAnswers).toEqual({ QUESTION_USERS: "50" });
    expect(lead.gclid).toBe("gclid-abc");
    expect(lead.adPlatform).toBe("google");
    expect(lead.campaignExternalId).toBe("7788");
  });

  it("une FIRST_NAME y LAST_NAME e ignora column_name", () => {
    const parsed = parseGoogleLead(
      body("g-names", {
        user_column_data: [
          { column_name: "FULL_NAME", string_value: "No soy el nombre", column_id: "CITY" },
          { string_value: "Ana", column_id: "FIRST_NAME" },
          { string_value: "Torres", column_id: "LAST_NAME" },
          { string_value: "ana@x.pe", column_id: "EMAIL" },
        ],
      }),
    );
    if (!parsed.ok) throw new Error("parse");
    const lead = toExternalLead(parsed.data, { externalFormId: "4455", mapping: {} }, new Date());
    expect(lead.fullName).toBe("Ana Torres");
    expect(lead.rawAnswers).toEqual({ CITY: "No soy el nombre" });
  });

  it("rechaza un cuerpo sin lead_id", () => {
    expect(parseGoogleLead({ form_id: 1 }).ok).toBe(false);
  });
});

describe("verifyGoogleKey", () => {
  it("compara la clave exacta", () => {
    expect(verifyGoogleKey(GOOGLE_KEY, GOOGLE_KEY)).toBe(true);
    expect(verifyGoogleKey(`${GOOGLE_KEY}x`, GOOGLE_KEY)).toBe(false);
    expect(verifyGoogleKey("", GOOGLE_KEY)).toBe(false);
  });
});

describe("receiveGoogleLead", () => {
  it("una clave equivocada devuelve UNAUTHENTICATED y no guarda nada", async () => {
    const result = await receiveGoogleLead(
      db,
      { encryptionKey: key },
      adFormId,
      body("g-bad", { google_key: "otra" }),
    );
    expect(result.ok ? null : result.error.code).toBe("UNAUTHENTICATED");
    expect(await eventsFor("g-bad")).toHaveLength(0);
  });

  it("un formulario desconocido o un id que no es uuid devuelve NOT_FOUND", async () => {
    const unknown = await receiveGoogleLead(
      db,
      { encryptionKey: key },
      "00000000-0000-4000-8000-00000000abcd",
      body("g-404"),
    );
    expect(unknown.ok ? null : unknown.error.code).toBe("NOT_FOUND");
    const notUuid = await receiveGoogleLead(db, { encryptionKey: key }, "abc", body("g-404"));
    expect(notUuid.ok ? null : notUuid.error.code).toBe("NOT_FOUND");
    expect(await eventsFor("g-404")).toHaveLength(0);
  });

  it("un lead válido se registra sin la clave y processInbound crea el lead de Google", async () => {
    const received = await receiveGoogleLead(db, { encryptionKey: key }, adFormId, body("g-1"));
    if (!received.ok) throw new Error(received.error.message);
    const [event] = await eventsFor("g-1");
    expect(JSON.stringify(event?.payload)).not.toContain(GOOGLE_KEY);

    const result = await processInbound(db, deps, received.data.inboundEventId);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.status).toBe("procesado");
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, result.data.leadId ?? ""));
    expect(lead?.source).toBe("google_lead_form");
    expect(lead?.adPlatform).toBe("google");
    expect(lead?.gclid).toBe("gclid-abc");
    expect(lead?.adFormId).toBe(adFormId);
    expect(lead?.isTest).toBe(false);

    const again = await receiveGoogleLead(db, { encryptionKey: key }, adFormId, body("g-1"));
    expect(again.ok && again.data.duplicate).toBe(true);
  });

  it("un lead de prueba queda con is_test y sin lead/created", async () => {
    const received = await receiveGoogleLead(
      db,
      { encryptionKey: key },
      adFormId,
      body("g-test", { is_test: true }),
    );
    if (!received.ok) throw new Error(received.error.message);
    const result = await processInbound(db, deps, received.data.inboundEventId);
    if (!result.ok || !result.data.leadId) throw new Error("process");
    const [lead] = await db.select().from(leads).where(eq(leads.id, result.data.leadId));
    expect(lead?.isTest).toBe(true);
    const announced = await db.select().from(outbox).where(eq(outbox.eventName, "lead/created"));
    expect(announced.some((row) => (row.payload as { leadId: string }).leadId === lead?.id)).toBe(
      false,
    );
  });
});
