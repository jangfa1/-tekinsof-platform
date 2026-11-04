import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ExternalLead, ingestExternalLead } from "../src/capture/external-leads.ts";
import { markInbound, recordInboundEvent } from "../src/capture/inbound.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { adForms, campaigns, inboundEvents, leads, outbox } from "../src/db/schema.ts";

let db: Db;
let close: () => Promise<void>;
let metaCampaignId: string;
let mappedCampaignId: string;

const metaLead = (overrides: Partial<ExternalLead> = {}): ExternalLead => ({
  provider: "meta",
  externalLeadId: "lead-1",
  externalFormId: "form-meta-1",
  formName: "ERP — Formulario instantáneo",
  campaignExternalId: "120200000001",
  adId: "ad-1",
  adsetId: "adset-1",
  adPlatform: "facebook",
  fullName: "Carla Rojas",
  email: "Carla@Empresa.pe",
  phone: "959 926 642",
  rawAnswers: { "¿cuántos usuarios?": "50" },
  submittedAt: "2026-10-30T15:00:00Z",
  ...overrides,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [meta, mapped] = await db
    .insert(campaigns)
    .values([
      {
        name: "Meta ERP Q4",
        slug: "meta-erp-q4",
        channel: "meta_ads",
        externalRefs: { meta: ["120200000001"] },
      },
      { name: "Google BI", slug: "google-bi", channel: "google_ads" },
    ])
    .returning({ id: campaigns.id });
  if (!meta || !mapped) throw new Error("setup");
  metaCampaignId = meta.id;
  mappedCampaignId = mapped.id;
});
afterAll(async () => {
  await close();
});

async function leadOutboxRows(leadId: string) {
  const rows = await db.select().from(outbox).where(eq(outbox.eventName, "lead/created"));
  return rows.filter((row) => (row.payload as { leadId: string }).leadId === leadId);
}

describe("recordInboundEvent", () => {
  const event = {
    provider: "meta" as const,
    eventType: "leadgen",
    externalId: "leadgen-777",
    payload: { leadgen_id: "777" },
    signatureValid: true,
  };

  it("guarda el evento una sola vez y marca el duplicado", async () => {
    const first = await recordInboundEvent(db, event);
    const second = await recordInboundEvent(db, event);
    expect(first.ok && first.data.duplicate).toBe(false);
    expect(second.ok && second.data.duplicate).toBe(true);
    if (!first.ok || !second.ok) throw new Error("inbound");
    expect(second.data.inboundEventId).toBe(first.data.inboundEventId);

    const stored = await db
      .select()
      .from(inboundEvents)
      .where(and(eq(inboundEvents.provider, "meta"), eq(inboundEvents.externalId, "leadgen-777")));
    expect(stored).toHaveLength(1);
    const events = (await db.select().from(outbox)).filter(
      (row) =>
        row.eventName === "inbound/received" &&
        (row.payload as { inboundEventId: string }).inboundEventId === first.data.inboundEventId,
    );
    expect(events).toHaveLength(1);
  });

  it("markInbound registra el resultado y cuenta el intento", async () => {
    const recorded = await recordInboundEvent(db, { ...event, externalId: "leadgen-778" });
    if (!recorded.ok) throw new Error("inbound");
    await markInbound(db, recorded.data.inboundEventId, "error", "Graph 400");
    const [row] = await db
      .select()
      .from(inboundEvents)
      .where(eq(inboundEvents.id, recorded.data.inboundEventId));
    expect(row?.status).toBe("error");
    expect(row?.error).toBe("Graph 400");
    expect(row?.attempts).toBe(1);
  });

  it("rechaza un payload que no es un objeto", async () => {
    const result = await recordInboundEvent(db, {
      ...event,
      externalId: "leadgen-779",
      payload: "texto" as unknown as Record<string, unknown>,
    });
    expect(result.ok).toBe(false);
  });
});

describe("ingestExternalLead", () => {
  it("crea el lead de Meta con la campaña de external_refs y un outbox", async () => {
    const result = await ingestExternalLead(db, metaLead());
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.duplicate).toBe(false);
    const [row] = await db.select().from(leads).where(eq(leads.id, result.data.leadId));
    expect(row?.source).toBe("meta_lead_ads");
    expect(row?.campaignId).toBe(metaCampaignId);
    expect(row?.adPlatform).toBe("facebook");
    expect(row?.email).toBe("carla@empresa.pe");
    expect(row?.phone).toBe("+51959926642");
    expect(row?.consentAt?.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    expect(row?.rawAnswers).toEqual({ "¿cuántos usuarios?": "50" });
    expect(await leadOutboxRows(result.data.leadId)).toHaveLength(1);

    const [form] = await db.select().from(adForms).where(eq(adForms.externalFormId, "form-meta-1"));
    expect(form?.name).toBe("ERP — Formulario instantáneo");
    expect(form?.campaignId).toBeNull();
    expect(row?.adFormId).toBe(form?.id);
  });

  it("el mismo lead otra vez devuelve el primero sin escribir nada", async () => {
    const before = (await db.select().from(leads)).length;
    const result = await ingestExternalLead(db, metaLead());
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.duplicate).toBe(true);
    expect((await db.select().from(leads)).length).toBe(before);
    expect(await leadOutboxRows(result.data.leadId)).toHaveLength(1);
  });

  it("la campaña del formulario mapeado tiene prioridad", async () => {
    await db.insert(adForms).values({
      provider: "google_ads",
      externalFormId: "form-google-1",
      name: "BI",
      campaignId: mappedCampaignId,
    });
    const result = await ingestExternalLead(
      db,
      metaLead({
        provider: "google_ads",
        externalLeadId: "g-1",
        externalFormId: "form-google-1",
        campaignExternalId: "otro",
        adPlatform: "google",
        gclid: "Cj0-gclid",
        jobTitle: "Gerente de TI",
      }),
    );
    if (!result.ok) throw new Error(result.error.message);
    const [row] = await db.select().from(leads).where(eq(leads.id, result.data.leadId));
    expect(row?.source).toBe("google_lead_form");
    expect(row?.campaignId).toBe(mappedCampaignId);
    expect(row?.gclid).toBe("Cj0-gclid");
    expect(row?.rawAnswers).toMatchObject({ job_title: "Gerente de TI" });
  });

  it("un lead de prueba se guarda marcado y sin outbox", async () => {
    const result = await ingestExternalLead(
      db,
      metaLead({ externalLeadId: "test-1", isTest: true, adPlatform: "instagram" }),
    );
    if (!result.ok) throw new Error(result.error.message);
    const [row] = await db.select().from(leads).where(eq(leads.id, result.data.leadId));
    expect(row?.isTest).toBe(true);
    expect(row?.adPlatform).toBe("instagram");
    expect(await leadOutboxRows(result.data.leadId)).toHaveLength(0);
  });

  it("sin correo ni teléfono devuelve VALIDATION_ERROR y no escribe", async () => {
    const before = (await db.select().from(leads)).length;
    const result = await ingestExternalLead(
      db,
      metaLead({ externalLeadId: "sin-contacto", email: undefined, phone: undefined }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect((await db.select().from(leads)).length).toBe(before);
  });

  it("conserva un teléfono que el normalizador no reconoce", async () => {
    const result = await ingestExternalLead(
      db,
      metaLead({ externalLeadId: "tel-raro", email: undefined, phone: "01 4567890", fullName: "" }),
    );
    if (!result.ok) throw new Error(result.error.message);
    const [row] = await db.select().from(leads).where(eq(leads.id, result.data.leadId));
    expect(row?.phone).toBe("01 4567890");
    expect(row?.fullName).toBe("01 4567890");
  });
});
