import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import {
  appSettings,
  campaignSpendDaily,
  campaigns,
  leads,
  opportunities,
  users,
} from "../src/db/schema.ts";
import { getMarketingDashboard } from "../src/marketing/dashboard.ts";
import { divRound, parseRate, toPen, withMetrics } from "../src/marketing/metrics.ts";

const marketing: Actor = { id: "d-m", email: "m@tekinsof.com", role: "marketing" };
const ventas: Actor = { id: "d-v", email: "v@tekinsof.com", role: "ventas" };
const october = { from: "2026-10-01", to: "2026-10-31" };

let db: Db;
let close: () => Promise<void>;
const ids: Record<string, string> = {};
let phone = 900000000;

type LeadValues = Partial<typeof leads.$inferInsert>;
async function lead(values: LeadValues = {}) {
  const [row] = await db
    .insert(leads)
    .values({
      fullName: "Prospecto",
      source: "manual",
      phone: `+51${phone++}`,
      createdAt: new Date("2026-10-15T15:00:00Z"),
      ...values,
    })
    .returning({ id: leads.id });
  return row?.id ?? "";
}

async function opportunity(leadId: string, values: Partial<typeof opportunities.$inferInsert>) {
  await db
    .insert(opportunities)
    .values({ title: "Proyecto", ownerId: ventas.id, leadId, ...values });
}

async function spend(values: Partial<typeof campaignSpendDaily.$inferInsert>) {
  await db.insert(campaignSpendDaily).values({
    provider: "manual",
    adPlatform: "facebook",
    date: "2026-10-10",
    spendCents: 0,
    currency: "PEN",
    ...values,
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: marketing.id, name: "Marketing", email: marketing.email, role: "marketing" },
    { id: ventas.id, name: "Valeria", email: ventas.email, role: "ventas" },
  ]);
  await db
    .insert(appSettings)
    .values({ key: "exchange_rate_default", value: { usdToPen: "3.8000" } });
  for (const name of ["cpl", "funnel", "platforms", "roi", "contact"]) {
    const [row] = await db
      .insert(campaigns)
      .values({ name: `Campaña ${name}`, slug: `campana-${name}`, channel: "meta_ads" })
      .returning({ id: campaigns.id });
    ids[name] = row?.id ?? "";
  }

  // CPL: 4 real leads, a test lead that must not count, and S/ 100.00 of spend.
  for (let i = 0; i < 4; i++) await lead({ campaignId: ids.cpl, adPlatform: "google" });
  await lead({ campaignId: ids.cpl, adPlatform: "google", isTest: true });
  await spend({ campaignId: ids.cpl, adPlatform: "google", spendCents: 10000 });

  // Funnel: 10 leads, 6 contacted, 3 of them with an opportunity.
  for (let i = 0; i < 10; i++) {
    const id = await lead({
      campaignId: ids.funnel,
      ownerId: ventas.id,
      firstContactedAt: i < 6 ? new Date("2026-10-16T15:00:00Z") : null,
    });
    if (i < 3) await opportunity(id, {});
  }

  // Facebook and Instagram: Instagram spend is in dollars.
  for (let i = 0; i < 2; i++) await lead({ campaignId: ids.platforms, adPlatform: "facebook" });
  for (let i = 0; i < 3; i++) await lead({ campaignId: ids.platforms, adPlatform: "instagram" });
  await spend({ campaignId: ids.platforms, adPlatform: "facebook", spendCents: 6000 });
  await spend({
    campaignId: ids.platforms,
    adPlatform: "instagram",
    spendCents: 1000,
    currency: "USD",
  });

  // ROI: won 36 days after the lead (counts), and one won 120 days after (outside the window).
  const winner = await lead({ campaignId: ids.roi, adPlatform: "tiktok" });
  await opportunity(winner, {
    stage: "ganada",
    amountCents: 50000,
    wonAt: new Date("2026-11-20T15:00:00Z"),
  });
  const late = await lead({ campaignId: ids.roi, adPlatform: "tiktok" });
  await opportunity(late, {
    stage: "ganada",
    amountCents: 90000,
    wonAt: new Date("2027-02-12T15:00:00Z"),
  });
  await spend({ campaignId: ids.roi, adPlatform: "tiktok", spendCents: 10000 });

  // First contact: 2.5 business hours (Monday) and 2 (Friday 17:00 → Monday 10:00).
  await lead({
    campaignId: ids.contact,
    createdAt: new Date("2026-10-05T15:00:00Z"),
    firstContactedAt: new Date("2026-10-05T17:30:00Z"),
  });
  await lead({
    campaignId: ids.contact,
    createdAt: new Date("2026-10-09T22:00:00Z"),
    firstContactedAt: new Date("2026-10-12T15:00:00Z"),
  });

  // Spend of a Meta campaign nobody mapped yet, and a lead outside the period.
  await spend({
    provider: "meta",
    externalCampaignId: "777",
    adPlatform: "facebook",
    spendCents: 2000,
  });
  await lead({ createdAt: new Date("2026-11-02T15:00:00Z") });
});
afterAll(async () => {
  await close();
});

async function dashboard(filters: Record<string, string> = {}) {
  const result = await getMarketingDashboard(db, marketing, { ...october, ...filters });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("métricas puras", () => {
  it("convierte dólares y redondea sin flotantes", () => {
    expect(parseRate("3.8000")).toBe(38000);
    expect(parseRate("tres")).toBe(37500);
    expect(toPen(1000, "USD", 38000)).toBe(3800);
    expect(toPen(1000, "PEN", 38000)).toBe(1000);
    expect([divRound(5, 2), divRound(-5, 2), divRound(3800, 3)]).toEqual([3, -3, 1267]);
  });

  it("sin leads el CPL es nulo y sin gasto no hay ROI", () => {
    const metrics = withMetrics({
      leads: 0,
      contacted: 0,
      qualified: 0,
      opportunities: 0,
      proposals: 0,
      won: 0,
      wonAmountCents: 0,
      spendCents: 0,
    });
    expect(metrics).toMatchObject({ cplCents: null, cpoCents: null, roasBp: null, roiBp: null });
    // Leads without recorded spend: the cost is unknown, never S/ 0.
    expect(withMetrics({ ...metrics, leads: 3, opportunities: 1 })).toMatchObject({
      cplCents: null,
      cpoCents: null,
    });
  });
});

describe("getMarketingDashboard", () => {
  it("una campaña con 4 leads y S/ 100 de gasto tiene CPL de S/ 25", async () => {
    const data = await dashboard();
    const row = data.byCampaign.find((r) => r.key === ids.cpl);
    expect(row?.metrics).toMatchObject({ leads: 4, spendCents: 10000, cplCents: 2500 });
  });

  it("sin ventas no nombra la mejor conversión ni la mejor campaña", async () => {
    const data = await dashboard({ campaignId: ids.cpl ?? "" });
    expect(data.highlights).toMatchObject({
      mostLeads: "google",
      bestConversion: null,
      bestCampaign: null,
    });
  });

  it("un lead de prueba no cuenta en ningún lado", async () => {
    const data = await dashboard({ campaignId: ids.cpl ?? "" });
    expect(data.totals.leads).toBe(4);
    expect(data.byPlatform.find((r) => r.key === "google")?.metrics.leads).toBe(4);
    expect(data.byPeriod.reduce((sum, r) => sum + r.metrics.leads, 0)).toBe(4);
  });

  it("el embudo muestra 10 leads, 6 contactados y 3 oportunidades", async () => {
    const data = await dashboard({ campaignId: ids.funnel ?? "" });
    const counts = Object.fromEntries(data.funnel.map((stage) => [stage.key, stage.count]));
    expect(counts).toMatchObject({ leads: 10, contacted: 6, opportunities: 3, won: 0 });
    expect(data.funnel.find((s) => s.key === "contacted")?.fromPreviousBp).toBe(6000);
    expect(data.totals.opportunityRateBp).toBe(3000);
  });

  it("ventas no puede ver el dashboard", async () => {
    const result = await getMarketingDashboard(db, ventas, october);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("separa Facebook e Instagram y pasa el gasto en dólares a soles", async () => {
    const data = await dashboard({ campaignId: ids.platforms ?? "" });
    const metrics = (key: string) => data.byPlatform.find((r) => r.key === key)?.metrics;
    expect(metrics("facebook")).toMatchObject({ leads: 2, spendCents: 6000, cplCents: 3000 });
    expect(metrics("instagram")).toMatchObject({ leads: 3, spendCents: 3800, cplCents: 1267 });
    expect(data.byPlatform.map((r) => r.key)).toEqual([
      "facebook",
      "instagram",
      "google",
      "tiktok",
    ]);
    expect(data.highlights).toMatchObject({ mostLeads: "instagram", bestCpl: "instagram" });
  });

  it("cuenta la venta cerrada dentro de 90 días y calcula ROAS y ROI", async () => {
    const data = await dashboard({ campaignId: ids.roi ?? "" });
    expect(data.totals).toMatchObject({
      leads: 2,
      won: 1,
      wonAmountCents: 50000,
      spendCents: 10000,
      roasBp: 50000,
      roiBp: 40000,
      conversionBp: 5000,
    });
    expect(data.highlights.mostWon).toBe("tiktok");
  });

  it("el gasto sin asociar suma en su plataforma pero en ninguna campaña", async () => {
    const data = await dashboard();
    expect(data.unmappedSpendCents).toBe(2000);
    expect(data.byPlatform.find((r) => r.key === "facebook")?.metrics.spendCents).toBe(8000);
    const campaignSpend = data.byCampaign.reduce((sum, r) => sum + (r.metrics.spendCents ?? 0), 0);
    expect(data.totals.spendCents).toBe(campaignSpend + 2000);
    expect(data.highlights.bestCampaign).toBe(ids.roi);
  });

  it("los filtros de vendedor no inventan gasto", async () => {
    const data = await dashboard({ ownerId: ventas.id });
    expect(data.spendComparable).toBe(false);
    expect(data.totals).toMatchObject({ leads: 10, spendCents: null, cplCents: null });
    expect(data.byOwner).toHaveLength(1);
    expect(data.unmappedSpendCents).toBeNull();
  });

  it("filtra por plataforma, incluido orgánico y directo", async () => {
    expect((await dashboard({ platform: "tiktok" })).totals.leads).toBe(2);
    const organic = await dashboard({ platform: "organico" });
    expect(organic.totals.leads).toBe(12);
    expect(organic.totals.spendCents).toBe(0);
  });

  it("mide la mediana del primer contacto en horas laborables", async () => {
    const data = await dashboard({ campaignId: ids.contact ?? "" });
    expect(data.medianFirstContactHours).toBe(2.3);
  });

  it("agrupa por día hasta 62 días y por mes en rangos más largos", async () => {
    const days = await dashboard();
    expect(days.periodUnit).toBe("day");
    expect(days.byPeriod).toHaveLength(31);
    // Created 2026-10-09 22:00 UTC = 17:00 in Lima, same day.
    const contactDay = await dashboard({ campaignId: ids.contact ?? "" });
    expect(contactDay.byPeriod.find((r) => r.key === "2026-10-09")?.metrics.leads).toBe(1);

    const months = await dashboard({ from: "2026-09-01", to: "2026-11-30" });
    expect(months.periodUnit).toBe("month");
    expect(months.byPeriod.map((r) => r.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(months.byPeriod.find((r) => r.key === "2026-11")?.metrics.leads).toBe(1);
  });

  it("rechaza un rango invertido", async () => {
    const result = await getMarketingDashboard(db, marketing, {
      from: "2026-10-31",
      to: "2026-10-01",
    });
    expect(result.ok).toBe(false);
  });
});
