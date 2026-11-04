import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import {
  auditEvents,
  campaignSpendDaily,
  campaigns,
  integrationAccounts,
  users,
} from "../src/db/schema.ts";
import { createMailer } from "../src/integrations/graph.ts";
import { encryptSecret } from "../src/integrations/secrets.ts";
import { syncMetaSpend } from "../src/marketing/meta-spend.ts";
import {
  decimalToCents,
  listUnmappedCampaigns,
  mapMetaCampaign,
  recordManualSpend,
  unmapMetaCampaign,
} from "../src/marketing/spend.ts";

const marketing: Actor = { id: "sp-m", email: "m@tekinsof.com", role: "marketing" };
const ventas: Actor = { id: "sp-v", email: "v@tekinsof.com", role: "ventas" };
const encryptionKey = Buffer.alloc(32, 7);
const TOKEN = "EAAGspendToken0123456789abc";
// 10:00 in Lima: the sync covers 2026-10-28 … 2026-10-30.
const now = new Date("2026-10-31T15:00:00Z");

type Route = { status?: number; body: unknown };
let routes: Record<string, Route> = {};
let requested: string[] = [];

const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v24\.0/, "");
  requested.push(`${path}${url.search}`);
  const { status = 200, body } = routes[path] ?? { status: 404, body: { error: { code: 803 } } };
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

const makeDeps = () => ({
  meta: { fetch: fakeFetch, graphVersion: "v24.0" },
  encryptionKey,
  mailer: createMailer({ driver: "log" }),
  systemSender: "notificaciones@tekinsof.com",
  crmBaseUrl: "https://crm.tekinsof.com",
});

const insight = (campaign: string, platform: string, spend: string, extra = {}) => ({
  campaign_id: campaign,
  campaign_name: `Meta ${campaign}`,
  publisher_platform: platform,
  date_start: "2026-10-30",
  date_stop: "2026-10-30",
  spend,
  impressions: "1000",
  clicks: "40",
  ...extra,
});

let db: Db;
let close: () => Promise<void>;
let mappedCampaign: string;
let otherCampaign: string;

async function connectAdAccount(id: string, name: string, accountType = "ad_account") {
  const [row] = await db
    .insert(integrationAccounts)
    .values({
      provider: "meta",
      accountType,
      externalAccountId: id,
      displayName: name,
      credentialsEncrypted: encryptSecret(TOKEN, encryptionKey),
    })
    .returning({ id: integrationAccounts.id });
  return row?.id ?? "";
}

const spendRows = (externalCampaignId: string) =>
  db
    .select()
    .from(campaignSpendDaily)
    .where(eq(campaignSpendDaily.externalCampaignId, externalCampaignId));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: "sp-g", name: "Gerente", email: "g@tekinsof.com", role: "gerencia" },
    { id: marketing.id, name: "Marketing", email: marketing.email, role: "marketing" },
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
  ]);
  const rows = await db
    .insert(campaigns)
    .values([
      { name: "ERP Meta", slug: "erp-meta", channel: "meta_ads", externalRefs: { meta: ["2001"] } },
      { name: "Google ERP", slug: "google-erp", channel: "google_ads" },
    ])
    .returning({ id: campaigns.id });
  mappedCampaign = rows[0]?.id ?? "";
  otherCampaign = rows[1]?.id ?? "";
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  routes = {};
  requested = [];
  // Each test works with its own ad account.
  await db.update(integrationAccounts).set({ status: "revocada" });
});

describe("decimalToCents", () => {
  it("convierte montos de texto con aritmética entera", () => {
    expect(["123.45", "0", "12.3", "1234.567", "0.004", "1,234.50"].map(decimalToCents)).toEqual([
      12345, 0, 1230, 123457, 0, 123450,
    ]);
    expect(["-5", "abc", "", "1e3"].map(decimalToCents)).toEqual([null, null, null, null]);
  });
});

describe("syncMetaSpend", () => {
  it("guarda el gasto por campaña, plataforma y día, y una segunda sincronización actualiza", async () => {
    await connectAdAccount("9001", "Cuenta Tekinsof");
    // A Page is not an ad account: the spend sync never asks it for insights.
    await connectAdAccount("5009", "Página", "page");
    routes = {
      "/act_9001": { body: { currency: "PEN", timezone_name: "America/Lima" } },
      "/act_9001/insights": {
        body: {
          data: [
            insight("2001", "facebook", "123.45", {
              actions: [{ action_type: "lead", value: "4" }],
            }),
            insight("2001", "instagram", "10.00"),
            insight("2001", "audience_network", "1.10"),
            insight("2001", "messenger", "0.90"),
            insight("3001", "facebook", "50.00"),
          ],
        },
      },
    };
    const result = await syncMetaSpend(db, makeDeps(), now);
    expect(result).toEqual({
      ok: true,
      data: { accounts: 1, rows: 4, unmapped: 1, expired: 0, failed: 0 },
    });
    expect(requested.some((url) => url.startsWith("/5009"))).toBe(false);
    const insightsUrl = requested.find((url) => url.startsWith("/act_9001/insights")) ?? "";
    expect(decodeURIComponent(insightsUrl)).toContain(
      '{"since":"2026-10-28","until":"2026-10-30"}',
    );
    expect(insightsUrl).toContain("breakdowns=publisher_platform");

    const byPlatform = Object.fromEntries(
      (await spendRows("2001")).map((row) => [row.adPlatform, row]),
    );
    expect(byPlatform.facebook).toMatchObject({
      campaignId: mappedCampaign,
      provider: "meta",
      date: "2026-10-30",
      spendCents: 12345,
      currency: "PEN",
      impressions: 1000,
      clicks: 40,
      platformLeads: 4,
    });
    expect(byPlatform.instagram?.spendCents).toBe(1000);
    // Audience Network and Messenger fold into "otra".
    expect(byPlatform.otra?.spendCents).toBe(200);

    routes["/act_9001/insights"] = { body: { data: [insight("2001", "facebook", "130.00")] } };
    await syncMetaSpend(db, makeDeps(), now);
    const facebook = (await spendRows("2001")).filter((row) => row.adPlatform === "facebook");
    expect(facebook).toHaveLength(1);
    expect(facebook[0]?.spendCents).toBe(13000);
  });

  it("guarda sin asociar el gasto de una campaña desconocida y lo recupera al asociarla", async () => {
    const [unmapped] = await listUnmappedCampaigns(db);
    expect(unmapped).toMatchObject({
      provider: "meta",
      externalCampaignId: "3001",
      name: "Meta 3001",
      spendCents: 5000,
      lastDate: "2026-10-30",
    });

    const forbidden = await mapMetaCampaign(db, ventas, {
      campaignId: otherCampaign,
      externalCampaignId: "3001",
    });
    expect(forbidden.ok).toBe(false);

    const mapped = await mapMetaCampaign(db, marketing, {
      campaignId: otherCampaign,
      externalCampaignId: "3001",
    });
    expect(mapped).toEqual({ ok: true, data: { attachedRows: 1 } });
    expect((await spendRows("3001"))[0]?.campaignId).toBe(otherCampaign);
    expect(await listUnmappedCampaigns(db)).toEqual([]);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, otherCampaign));
    expect(campaign?.externalRefs).toEqual({ meta: ["3001"] });

    const taken = await mapMetaCampaign(db, marketing, {
      campaignId: mappedCampaign,
      externalCampaignId: "3001",
    });
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error.code).toBe("CONFLICT");

    const undone = await unmapMetaCampaign(db, marketing, {
      campaignId: otherCampaign,
      externalCampaignId: "3001",
    });
    expect(undone).toEqual({ ok: true, data: { detachedRows: 1 } });
    expect((await listUnmappedCampaigns(db)).map((c) => c.externalCampaignId)).toEqual(["3001"]);
  });

  it("un token vencido marca la cuenta publicitaria y avisa a Gerencia una sola vez", async () => {
    const accountId = await connectAdAccount("9002", "Cuenta vencida");
    routes = {
      "/act_9002": { status: 400, body: { error: { code: 190, message: "Error validating" } } },
    };
    const deps = makeDeps();
    expect(await syncMetaSpend(db, deps, now)).toMatchObject({ ok: true, data: { expired: 1 } });
    const [account] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));
    expect(account?.status).toBe("expirada");
    expect(deps.mailer.outbox.map((m) => m.to[0])).toEqual(["g@tekinsof.com"]);
    expect(deps.mailer.outbox[0]?.subject).toBe("Token de Meta vencido: Cuenta vencida");
    expect(deps.mailer.outbox[0]?.html).toContain("el gasto de sus campañas no se actualizará");
    const audit = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "integration.token_expired"),
          eq(auditEvents.targetId, accountId),
        ),
      );
    expect(audit[0]?.metadata).toEqual({ provider: "meta", adAccountId: "9002" });

    expect(await syncMetaSpend(db, deps, now)).toMatchObject({ data: { accounts: 0 } });
    expect(deps.mailer.outbox).toHaveLength(1);
  });

  it("una moneda distinta de PEN o USD deja el error en la cuenta sin guardar gasto", async () => {
    const accountId = await connectAdAccount("9003", "Cuenta en euros");
    routes = { "/act_9003": { body: { currency: "EUR" } } };
    expect(await syncMetaSpend(db, makeDeps(), now)).toMatchObject({ data: { failed: 1 } });
    const [account] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));
    expect(account).toMatchObject({ status: "conectada" });
    expect(account?.lastError).toContain("EUR");
    expect(requested.some((url) => url.startsWith("/act_9003/insights"))).toBe(false);
  });
});

describe("recordManualSpend", () => {
  const spend = { date: "2026-10-30", adPlatform: "google" as const, currency: "PEN" as const };

  it("ventas no puede registrar gasto", async () => {
    const result = await recordManualSpend(db, ventas, {
      ...spend,
      campaignId: otherCampaign,
      spendCents: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("un monto negativo es VALIDATION_ERROR", async () => {
    const result = await recordManualSpend(db, marketing, {
      ...spend,
      campaignId: otherCampaign,
      spendCents: -100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fields?.spendCents).toBe("El monto no puede ser negativo");
    }
  });

  it("registrar el mismo día y plataforma corrige el monto y audita", async () => {
    const input = { ...spend, campaignId: otherCampaign };
    expect((await recordManualSpend(db, marketing, { ...input, spendCents: 5000 })).ok).toBe(true);
    expect((await recordManualSpend(db, marketing, { ...input, spendCents: 7500 })).ok).toBe(true);
    await recordManualSpend(db, marketing, { ...input, adPlatform: "tiktok", spendCents: 2000 });
    const rows = await db
      .select()
      .from(campaignSpendDaily)
      .where(
        and(
          eq(campaignSpendDaily.campaignId, otherCampaign),
          eq(campaignSpendDaily.provider, "manual"),
        ),
      );
    expect(rows.map((row) => [row.adPlatform, row.spendCents]).sort()).toEqual([
      ["google", 7500],
      ["tiktok", 2000],
    ]);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, "spend.recorded"), eq(auditEvents.targetId, otherCampaign)),
      );
    expect(audits).toHaveLength(3);
  });
});
