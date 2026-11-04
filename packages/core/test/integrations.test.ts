import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import {
  adForms,
  auditEvents,
  campaigns,
  DEFAULT_ORGANIZATION_ID,
  inboundEvents,
  integrationAccounts,
  leads,
  opportunities,
  users,
} from "../src/db/schema.ts";
import { connectMetaPage, disconnectAccount, listAccounts } from "../src/integrations/accounts.ts";
import { createGoogleAdForm, listAdForms, mapAdForm } from "../src/integrations/ad-forms.ts";
import {
  deriveStatus,
  integrationOverview,
  limaPeriodStarts,
  overviewTotals,
} from "../src/integrations/overview.ts";
import { decryptSecret } from "../src/integrations/secrets.ts";
import { listInboundEvents, sendTestLead } from "../src/integrations/testing.ts";

let db: Db;
let close: () => Promise<void>;

const encryptionKey = Buffer.alloc(32, 7);
const organizationId = DEFAULT_ORGANIZATION_ID;
const deps = { organizationId, encryptionKey };
const gerencia: Actor = { id: "u-ger", email: "ger@tekinsof.com", role: "gerencia" };
const marketing: Actor = { id: "u-mkt", email: "mkt@tekinsof.com", role: "marketing" };
const now = new Date("2026-10-30T20:00:00Z"); // 15:00 in Lima
const testDeps = {
  organizationId,
  tiktokSecret: "tiktok-test-secret",
  now: () => now,
  process: { meta: { fetch, graphVersion: "v24.0" }, encryptionKey, now: () => now },
};
const TOKEN = "EAAGm0PX4ZCpsBAKZCtoken1234567890";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: gerencia.id, name: "Gabriela Gerente", email: gerencia.email, role: "gerencia" },
    { id: marketing.id, name: "Mario Marketing", email: marketing.email, role: "marketing" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("connectMetaPage", () => {
  it("cifra el token, lista la cuenta como conectada y audita", async () => {
    const result = await connectMetaPage(db, gerencia, deps, {
      pageId: "1029384756",
      displayName: "Tekinsof Perú",
      pageToken: TOKEN,
    });
    if (!result.ok) throw new Error(result.error.message);

    const [row] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, result.data.accountId));
    expect(row?.credentialsEncrypted).not.toContain(TOKEN);
    expect(decryptSecret(row?.credentialsEncrypted ?? "", encryptionKey)).toEqual({
      ok: true,
      data: TOKEN,
    });

    const [listed] = await listAccounts(db, organizationId);
    expect(listed).toMatchObject({ status: "conectada", connectedByName: "Gabriela Gerente" });
    expect(JSON.stringify(listed)).not.toContain(TOKEN);

    const audit = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "integration.connected"),
          eq(auditEvents.targetId, result.data.accountId),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.metadata)).not.toContain(TOKEN);
  });

  it("marketing no puede conectar y un ID con letras es inválido", async () => {
    const input = { pageId: "123456", displayName: "X", pageToken: TOKEN };
    expect((await connectMetaPage(db, marketing, deps, input)).ok).toBe(false);
    const invalid = await connectMetaPage(db, gerencia, deps, { ...input, pageId: "abc" });
    expect(invalid.ok ? null : invalid.error.fields?.pageId).toBeDefined();
  });

  it("desconectar revoca la cuenta y borra el token; reconectar la reactiva", async () => {
    const [account] = await listAccounts(db, organizationId);
    if (!account) throw new Error("setup");
    expect((await disconnectAccount(db, gerencia, deps, { accountId: account.id })).ok).toBe(true);
    const [revoked] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, account.id));
    expect(revoked).toMatchObject({ status: "revocada", credentialsEncrypted: "" });

    const again = await connectMetaPage(db, gerencia, deps, {
      pageId: "1029384756",
      displayName: "Tekinsof Perú",
      pageToken: TOKEN,
    });
    expect(again.ok && again.data.accountId).toBe(account.id);
    expect((await listAccounts(db, organizationId))[0]?.status).toBe("conectada");
  });
});

describe("formularios de Google", () => {
  it("devuelve la URL y la clave una vez y solo guarda la clave cifrada", async () => {
    const created = await createGoogleAdForm(
      db,
      gerencia,
      { ...deps, crmBaseUrl: "https://crm.tekinsof.com/" },
      { name: "Google — ERP", campaignId: "" },
    );
    if (!created.ok) throw new Error(created.error.message);
    const { adFormId, webhookUrl, key } = created.data;
    expect(webhookUrl).toBe(`https://crm.tekinsof.com/api/webhooks/google-leads/${adFormId}`);

    const [row] = await db.select().from(adForms).where(eq(adForms.id, adFormId));
    expect(row?.webhookKeyEncrypted).not.toContain(key);
    const listed = await listAdForms(db, organizationId);
    expect(JSON.stringify(listed)).not.toContain(key);
    expect(listed.find((f) => f.id === adFormId)).toMatchObject({ hasKey: true, campaignId: null });
  });

  it("mapAdForm asigna la campaña; un campo destino desconocido es inválido", async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: "Google ERP", slug: "google-erp", channel: "google_ads" })
      .returning({ id: campaigns.id });
    const [form] = await listAdForms(db, organizationId);
    if (!campaign || !form) throw new Error("setup");
    const mapped = await mapAdForm(db, marketing, deps, {
      adFormId: form.id,
      campaignId: campaign.id,
      fieldMapping: { RUC: "companyName" },
    });
    expect(mapped.ok).toBe(true);
    expect((await listAdForms(db, organizationId))[0]?.campaignName).toBe("Google ERP");
    const bad = await mapAdForm(db, marketing, deps, {
      adFormId: form.id,
      campaignId: null,
      fieldMapping: { RUC: "ruc" },
    });
    expect(bad.ok).toBe(false);
  });
});

describe("pruebas", () => {
  it("un lead de prueba de TikTok recorre el camino real y queda marcado", async () => {
    const run = await sendTestLead(db, gerencia, testDeps, { integration: "tiktok" });
    if (!run.ok) throw new Error(run.error.message);
    expect(run.data.steps.map((s) => s.ok)).toEqual([true, true, true]);
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, run.data.leadId ?? ""));
    expect(lead).toMatchObject({ isTest: true, source: "tiktok_lead_ads", adPlatform: "tiktok" });
  });

  it("un lead de prueba de Google valida la clave del formulario", async () => {
    const run = await sendTestLead(db, gerencia, testDeps, { integration: "google" });
    if (!run.ok) throw new Error(run.error.message);
    expect(run.data.steps.every((s) => s.ok)).toBe(true);
  });

  it("marketing no puede enviar pruebas", async () => {
    expect((await sendTestLead(db, marketing, testDeps, { integration: "tiktok" })).ok).toBe(false);
  });

  it("el registro de eventos no expone el payload y filtra por proveedor", async () => {
    const rows = await listInboundEvents(db, organizationId, { provider: "tiktok" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.provider === "tiktok")).toBe(true);
    expect(rows[0]).not.toHaveProperty("payload");
    expect(
      await listInboundEvents(db, organizationId, { status: "nada" as "error" }),
    ).toBeDefined();
  });
});

describe("estado y métricas", () => {
  it("limaPeriodStarts usa la medianoche de Lima", () => {
    const starts = limaPeriodStarts(new Date("2026-11-01T03:00:00Z")); // 31 oct, 22:00 en Lima
    expect(starts.today.toISOString()).toBe("2026-10-31T05:00:00.000Z");
    expect(starts.month.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("deriveStatus cubre los cuatro estados", () => {
    const base = {
      configured: true,
      accountProblem: null,
      received: 3,
      recent: 4,
      recentErrors: 1,
    };
    expect(deriveStatus(base).status).toBe("conectado");
    expect(deriveStatus({ ...base, configured: false }).status).toBe("desconectado");
    expect(deriveStatus({ ...base, received: 0 }).status).toBe("pendiente");
    expect(deriveStatus({ ...base, recentErrors: 2 }).status).toBe("error");
    expect(deriveStatus({ ...base, accountProblem: "Token vencido" })).toEqual({
      status: "error",
      detail: "Token vencido",
    });
  });

  it("cuenta leads de hoy y del mes sin pruebas, errores y conversión por plataforma", async () => {
    const base = {
      source: "meta_lead_ads",
      fullName: "Lead",
      email: "lead@empresa.pe",
      consentAt: now,
      consentVersion: "meta-form",
    };
    const inserted = await db
      .insert(leads)
      .values([
        { ...base, externalLeadId: "fb-1", adPlatform: "facebook", createdAt: now },
        { ...base, externalLeadId: "fb-2", adPlatform: "facebook", createdAt: now },
        // 1 oct, 10:00 in Lima: this month, not today.
        {
          ...base,
          externalLeadId: "ig-1",
          adPlatform: "instagram",
          createdAt: new Date("2026-10-01T15:00:00Z"),
        },
        // September: counted in the total only.
        {
          ...base,
          externalLeadId: "fb-old",
          adPlatform: "facebook",
          createdAt: new Date("2026-09-30T12:00:00Z"),
        },
      ])
      .returning({ id: leads.id });
    await db
      .insert(opportunities)
      .values({ title: "ERP", leadId: inserted[0]?.id, ownerId: marketing.id });
    await db.insert(inboundEvents).values({
      provider: "meta",
      eventType: "leadgen",
      externalId: "meta-err-1",
      payload: {},
      signatureValid: true,
      status: "error",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
    });

    const overview = await integrationOverview(db, {
      organizationId,
      now,
      tiktokSecretConfigured: true,
    });
    const by = Object.fromEntries(overview.map((o) => [o.integration.id, o]));
    expect(by.facebook?.metrics).toMatchObject({ total: 3, today: 2, month: 2, errors: 1 });
    expect(by.facebook?.metrics.conversion).toBe(0.5);
    expect(by.facebook).toMatchObject({ status: "conectado", responsible: "Gabriela Gerente" });
    expect(by.instagram?.metrics).toMatchObject({ total: 1, today: 0, month: 1 });
    // The TikTok test lead counts for the status but not for the metrics.
    expect(by.tiktok).toMatchObject({ status: "conectado", metrics: { total: 0 } });
    expect(by.google?.status).toBe("conectado");

    const totals = overviewTotals(overview);
    expect(totals).toMatchObject({ total: 4, today: 2, month: 3, errors: 1, converted: 1 });
  });
});
