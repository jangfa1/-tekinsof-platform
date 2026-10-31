import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestExternalLead } from "../src/capture/external-leads.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { leads, leadTouchpoints } from "../src/db/schema.ts";
import { createPublicLead } from "../src/leads/leads.ts";
import { backfillTouchpoints, platformFromAttribution } from "../src/marketing/attribution.ts";

const base = {
  fullName: "Ana Torres",
  consent: true as const,
  consentVersion: "2026-10-30",
  turnstileToken: "token",
  website: "",
};

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

const touches = (leadId: string) =>
  db
    .select()
    .from(leadTouchpoints)
    .where(eq(leadTouchpoints.leadId, leadId))
    .orderBy(asc(leadTouchpoints.occurredAt), asc(leadTouchpoints.createdAt));

async function leadRow(id: string) {
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}

describe("platformFromAttribution", () => {
  it("ubica la visita por su click id o su utm_source", () => {
    expect(
      [
        { gclid: "g" },
        { ttclid: "t" },
        { fbclid: "f" },
        { fbclid: "f", utmSource: "instagram" },
        { utmSource: "IG" },
        { utmSource: "facebook" },
        { utmSource: "meta_ads" },
        { utmSource: "google" },
        { utmSource: "tiktok" },
        { utmSource: "newsletter" },
        {},
      ].map(platformFromAttribution),
    ).toEqual([
      "google",
      "tiktok",
      "facebook",
      "instagram",
      "instagram",
      "facebook",
      "facebook",
      "google",
      "tiktok",
      null,
      null,
    ]);
  });
});

describe("puntos de contacto", () => {
  it("un lead del sitio con gclid queda como Google y con su primer contacto", async () => {
    const result = await createPublicLead(db, {
      ...base,
      email: "ana@empresa.pe",
      landingSlug: "erp-q4",
      gclid: "gclid-1",
      utm: { source: "google", medium: "cpc", campaign: "erp" },
    });
    if (!result.ok || !result.data.leadId) throw new Error("lead");
    expect(await leadRow(result.data.leadId)).toMatchObject({ adPlatform: "google" });
    const [touch] = await touches(result.data.leadId);
    expect(touch).toMatchObject({
      isConversion: true,
      source: "landing",
      adPlatform: "google",
      landingSlug: "erp-q4",
      utmMedium: "cpc",
      gclid: "gclid-1",
    });
  });

  it("si el mismo prospecto vuelve en 24 h se agrega un contacto, no otro lead", async () => {
    const first = await createPublicLead(db, {
      ...base,
      email: "luis@empresa.pe",
      fbclid: "fb-1",
      utm: { source: "instagram" },
    });
    const again = await createPublicLead(db, {
      ...base,
      email: "LUIS@empresa.pe",
      gclid: "gclid-2",
    });
    if (!first.ok || !again.ok || !first.data.leadId) throw new Error("lead");
    expect(again.data).toEqual({ leadId: first.data.leadId, deduplicated: true });
    expect(await leadRow(first.data.leadId)).toMatchObject({ adPlatform: "instagram" });
    const rows = await touches(first.data.leadId);
    expect(rows.map((t) => [t.isConversion, t.adPlatform])).toEqual([
      [true, "instagram"],
      [false, "google"],
    ]);
  });

  it("un lead de formulario de anuncio registra su formulario y plataforma", async () => {
    const result = await ingestExternalLead(db, {
      provider: "tiktok",
      externalLeadId: "tt-1",
      externalFormId: "tt-form-1",
      adPlatform: "tiktok",
      adId: "ad-9",
      fullName: "Carla",
      phone: "+51987654321",
      submittedAt: "2026-10-30T15:00:00Z",
    });
    if (!result.ok) throw new Error("ingest");
    const [touch] = await touches(result.data.leadId);
    expect(touch).toMatchObject({
      isConversion: true,
      source: "tiktok_lead_ads",
      adPlatform: "tiktok",
      adId: "ad-9",
    });
    expect(touch?.adFormId).not.toBeNull();
    expect(touch?.occurredAt.toISOString()).toBe("2026-10-30T15:00:00.000Z");
  });

  it("completa los leads anteriores una sola vez", async () => {
    const [old] = await db
      .insert(leads)
      .values({
        fullName: "Lead antiguo",
        source: "web_form",
        email: "antiguo@empresa.pe",
        fbclid: "fb-old",
        consentAt: new Date("2026-09-01T15:00:00Z"),
        createdAt: new Date("2026-09-01T15:00:00Z"),
      })
      .returning({ id: leads.id });
    if (!old) throw new Error("lead");
    expect(await backfillTouchpoints(db)).toEqual({ touchpoints: 1, platforms: 1 });
    expect(await leadRow(old.id)).toMatchObject({ adPlatform: "facebook" });
    expect((await touches(old.id))[0]).toMatchObject({ isConversion: true, fbclid: "fb-old" });
    expect(await backfillTouchpoints(db)).toEqual({ touchpoints: 0, platforms: 0 });
  });
});
