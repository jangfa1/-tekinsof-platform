import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordInboundEvent } from "../src/capture/inbound.ts";
import { type ProcessDeps, processInbound } from "../src/capture/process-inbound.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { adForms, inboundEvents, integrationAccounts, leads } from "../src/db/schema.ts";
import {
  type MetaLead,
  parseLeadgenWebhook,
  verifyMetaSignature,
} from "../src/integrations/meta.ts";
import { encryptSecret } from "../src/integrations/secrets.ts";

const appSecret = "meta-app-secret";
const pageToken = "EAAG-page-token";
const key = randomBytes(32);
const PAGE_ID = "1010";

let db: Db;
let close: () => Promise<void>;

// Graph answers keyed by leadgen id; anything else is a 404. Records what was requested.
const graph = new Map<string, { status: number; body: unknown }>();
const requests: Array<{ url: string; auth: string | null }> = [];
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  requests.push({ url, auth: new Headers(init?.headers).get("authorization") });
  const leadId = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
  const answer = graph.get(leadId) ?? { status: 404, body: { error: { message: "No existe" } } };
  return Response.json(answer.body, { status: answer.status });
}) as typeof fetch;

const deps: ProcessDeps = {
  meta: { fetch: fakeFetch, graphVersion: "v24.0" },
  encryptionKey: key,
  now: () => new Date("2026-10-30T16:00:00Z"),
};

const metaLead = (id: string, overrides: Partial<MetaLead> = {}): MetaLead => ({
  id,
  created_time: "2026-10-30T15:00:00+0000",
  ad_id: "ad-9",
  adset_id: "adset-9",
  campaign_id: "camp-9",
  form_id: "form-9",
  platform: "fb",
  field_data: [
    { name: "full_name", values: ["Lucía Paredes"] },
    { name: "email", values: ["lucia@empresa.pe"] },
    { name: "phone_number", values: ["+51959926642"] },
  ],
  ...overrides,
});

async function inbound(leadgenId: string, pageId = PAGE_ID) {
  const result = await recordInboundEvent(db, {
    provider: "meta",
    eventType: "leadgen",
    externalId: leadgenId,
    payload: { leadgen_id: leadgenId, page_id: pageId, form_id: "form-9", created_time: 1 },
    signatureValid: true,
  });
  if (!result.ok) throw new Error("inbound");
  return result.data.inboundEventId;
}

async function eventRow(id: string) {
  const [row] = await db.select().from(inboundEvents).where(eq(inboundEvents.id, id));
  return row;
}

async function leadRow(id: string | null) {
  if (!id) throw new Error("sin lead");
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(integrationAccounts).values({
    provider: "meta",
    externalAccountId: PAGE_ID,
    displayName: "Tekinsof",
    credentialsEncrypted: encryptSecret(pageToken, key),
  });
});
afterAll(async () => {
  await close();
});

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  const sign = (raw: string, secret = appSecret) =>
    `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

  it("acepta el HMAC del cuerpo exacto", () => {
    expect(verifyMetaSignature(body, sign(body), appSecret)).toBe(true);
  });

  it("rechaza un byte cambiado, otro secreto o la cabecera ausente", () => {
    expect(verifyMetaSignature(`${body} `, sign(body), appSecret)).toBe(false);
    expect(verifyMetaSignature(body, sign(body, "otro"), appSecret)).toBe(false);
    expect(verifyMetaSignature(body, null, appSecret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", appSecret)).toBe(false);
  });
});

describe("parseLeadgenWebhook", () => {
  it("devuelve solo las notificaciones leadgen", () => {
    const result = parseLeadgenWebhook({
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: 1,
          changes: [
            { field: "feed", value: { item: "post" } },
            {
              field: "leadgen",
              value: { leadgen_id: 444, page_id: 1010, form_id: "f", created_time: 1761836400 },
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: [{ leadgen_id: "444", page_id: "1010", form_id: "f", created_time: 1761836400 }],
    });
  });

  it("rechaza un objeto que no es de página", () => {
    expect(parseLeadgenWebhook({ object: "user", entry: [] }).ok).toBe(false);
  });
});

describe("processInbound (Meta)", () => {
  it("un lead de Instagram queda con ad_platform instagram y el evento procesado", async () => {
    graph.set("ig-1", { status: 200, body: metaLead("ig-1", { platform: "ig" }) });
    const eventId = await inbound("ig-1");
    const result = await processInbound(db, deps, eventId);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.status).toBe("procesado");

    const row = await leadRow(result.data.leadId);
    expect(row?.source).toBe("meta_lead_ads");
    expect(row?.adPlatform).toBe("instagram");
    expect(row?.fullName).toBe("Lucía Paredes");
    expect((await eventRow(eventId))?.status).toBe("procesado");
    const request = requests.at(-1);
    expect(request?.url).toContain("/v24.0/ig-1?fields=");
    expect(request?.url).not.toContain(pageToken);
    expect(request?.auth).toBe(`Bearer ${pageToken}`);
  });

  it("una pregunta sin mapear va a raw_answers y el mapeo del formulario se respeta", async () => {
    // The previous lead discovered form-9; Marketing then maps its custom question.
    await db
      .update(adForms)
      .set({ fieldMapping: { "¿empresa?": "companyName" } })
      .where(eq(adForms.externalFormId, "form-9"));
    graph.set("fb-2", {
      status: 200,
      body: metaLead("fb-2", {
        field_data: [
          { name: "first_name", values: ["Jorge"] },
          { name: "last_name", values: ["Quispe"] },
          { name: "email", values: ["jorge@empresa.pe"] },
          { name: "¿empresa?", values: ["Minera Sur"] },
          { name: "presupuesto_mensual", values: ["S/ 5000"] },
        ],
      }),
    });
    const result = await processInbound(db, deps, await inbound("fb-2"));
    if (!result.ok) throw new Error(result.error.message);
    const row = await leadRow(result.data.leadId);
    expect(row?.adPlatform).toBe("facebook");
    expect(row?.fullName).toBe("Jorge Quispe");
    expect(row?.companyName).toBe("Minera Sur");
    expect(row?.rawAnswers).toEqual({ presupuesto_mensual: "S/ 5000" });
  });

  it("un 400 de Graph marca el evento como error y devuelve error para reintentar", async () => {
    graph.set("fb-3", {
      status: 400,
      body: { error: { message: "Invalid OAuth access token", code: 190 } },
    });
    const eventId = await inbound("fb-3");
    const result = await processInbound(db, deps, eventId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fields?.graphCode).toBe("190");
    const row = await eventRow(eventId);
    expect(row?.status).toBe("error");
    expect(row?.error).toContain("Invalid OAuth access token");
  });

  it("una Página sin cuenta conectada queda ignorada y sin lead", async () => {
    graph.set("fb-4", { status: 200, body: metaLead("fb-4") });
    const before = (await db.select().from(leads)).length;
    const eventId = await inbound("fb-4", "9999");
    const result = await processInbound(db, deps, eventId);
    expect(result.ok && result.data.status).toBe("ignorado");
    expect((await eventRow(eventId))?.status).toBe("ignorado");
    expect((await db.select().from(leads)).length).toBe(before);
  });

  it("procesar otra vez un evento ya procesado no hace nada", async () => {
    graph.set("fb-5", { status: 200, body: metaLead("fb-5") });
    const eventId = await inbound("fb-5");
    await processInbound(db, deps, eventId);
    const calls = requests.length;
    const again = await processInbound(db, deps, eventId);
    expect(again.ok && again.data.status).toBe("procesado");
    expect(requests.length).toBe(calls);
  });
});
