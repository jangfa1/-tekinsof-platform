import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { metaLeadsBackfill, purgeInboundEvents } from "../src/capture/backfill.ts";
import { ingestExternalLead } from "../src/capture/external-leads.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import {
  adForms,
  auditEvents,
  inboundEvents,
  integrationAccounts,
  leads,
  users,
} from "../src/db/schema.ts";
import { createMailer } from "../src/integrations/graph.ts";
import { encryptSecret } from "../src/integrations/secrets.ts";

let db: Db;
let close: () => Promise<void>;

const encryptionKey = Buffer.alloc(32, 9);
const now = new Date("2026-10-30T20:00:00Z");
const TOKEN = "EAAGbackfillToken0123456789";

type Route = { status?: number; body: unknown };
let routes: Record<string, Route> = {};
let requested: string[] = [];

// Answers by URL path; a page cursor (`after=p2`) selects the `<path>?p2` route. An unknown Page
// has no forms.
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v24\.0/, "");
  const after = url.searchParams.get("after");
  requested.push(path);
  const route = after ? routes[`${path}?${after}`] : routes[path];
  const { status = 200, body } = route ?? { body: { data: [] } };
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

function makeDeps() {
  return {
    meta: { fetch: fakeFetch, graphVersion: "v24.0" },
    encryptionKey,
    mailer: createMailer({ driver: "log" }),
    systemSender: "notificaciones@tekinsof.com",
    crmBaseUrl: "https://crm.tekinsof.com",
  };
}

async function connectPage(pageId: string, displayName: string) {
  const [row] = await db
    .insert(integrationAccounts)
    .values({
      provider: "meta",
      externalAccountId: pageId,
      displayName,
      credentialsEncrypted: encryptSecret(TOKEN, encryptionKey),
    })
    .returning({ id: integrationAccounts.id });
  return row?.id ?? "";
}

const metaLead = (id: string, formId: string, email: string, platform = "fb") => ({
  id,
  created_time: "2026-10-30T19:30:00+0000",
  form_id: formId,
  platform,
  field_data: [
    { name: "full_name", values: ["Lucía Ramos"] },
    { name: "email", values: [email] },
  ],
});

const byExternalId = (externalLeadId: string) =>
  db.select().from(leads).where(eq(leads.externalLeadId, externalLeadId));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: "u-g1", name: "Gabriela", email: "g1@tekinsof.com", role: "gerencia" },
    { id: "u-g2", name: "Gonzalo", email: "g2@tekinsof.com", role: "gerencia" },
    { id: "u-g3", name: "Ex gerente", email: "g3@tekinsof.com", role: "gerencia", isActive: false },
    { id: "u-m1", name: "Mario", email: "m1@tekinsof.com", role: "marketing" },
  ]);
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  routes = {};
  requested = [];
  // Each test works with its own Page: earlier ones stop being visited.
  await db.update(integrationAccounts).set({ status: "revocada" });
});

describe("metaLeadsBackfill", () => {
  it("crea solo el lead que el webhook no entregó", async () => {
    await connectPage("5001", "Tekinsof Perú");
    // The webhook already delivered lead-a.
    const delivered = await ingestExternalLead(db, {
      provider: "meta",
      externalLeadId: "lead-a",
      externalFormId: "form-1",
      adPlatform: "facebook",
      fullName: "Ana",
      email: "ana@example.com",
      submittedAt: "2026-10-30T19:10:00Z",
    });
    expect(delivered.ok).toBe(true);
    routes = {
      "/5001/leadgen_forms": { body: { data: [{ id: "form-1", name: "ERP Perú" }] } },
      "/form-1/leads": {
        body: {
          data: [
            metaLead("lead-a", "form-1", "ana@example.com"),
            metaLead("lead-b", "form-1", "lucia@example.com", "ig"),
          ],
        },
      },
    };

    const result = await metaLeadsBackfill(db, makeDeps(), now);
    expect(result).toMatchObject({
      ok: true,
      data: { pages: 1, found: 2, created: 1, duplicates: 1, expired: 0, failed: 0 },
    });
    expect(await byExternalId("lead-a")).toHaveLength(1);
    const [missed] = await byExternalId("lead-b");
    expect(missed).toMatchObject({ source: "meta_lead_ads", adPlatform: "instagram" });

    // Running again inside the same window creates nothing new.
    const again = await metaLeadsBackfill(db, makeDeps(), now);
    expect(again).toMatchObject({ ok: true, data: { created: 0, duplicates: 2 } });
    expect(await byExternalId("lead-b")).toHaveLength(1);
  });

  it("sigue la paginación de Meta y omite formularios inactivos", async () => {
    await connectPage("5002", "Página paginada");
    await db.insert(adForms).values({
      provider: "meta",
      externalFormId: "form-off",
      name: "Formulario apagado",
      isActive: false,
    });
    routes = {
      "/5002/leadgen_forms": {
        body: {
          data: [{ id: "form-off" }],
          paging: { next: "https://graph.facebook.com/v24.0/5002/leadgen_forms?after=p2" },
        },
      },
      "/5002/leadgen_forms?p2": { body: { data: [{ id: "form-2", name: "Página 2" }] } },
      "/form-2/leads": { body: { data: [metaLead("lead-c", "form-2", "carla@example.com")] } },
      "/form-off/leads": { body: { data: [metaLead("lead-off", "form-off", "x@example.com")] } },
    };

    const result = await metaLeadsBackfill(db, makeDeps(), now);
    expect(result).toMatchObject({ ok: true, data: { created: 1 } });
    expect(await byExternalId("lead-c")).toHaveLength(1);
    expect(await byExternalId("lead-off")).toHaveLength(0);
    expect(requested).not.toContain("/form-off/leads");
  });

  it("un error 5xx de Meta no marca el token como vencido", async () => {
    const accountId = await connectPage("5003", "Página inestable");
    routes = {
      "/5003/leadgen_forms": {
        status: 500,
        body: { error: { code: 2, message: "Service temporarily unavailable" } },
      },
    };
    const deps = makeDeps();
    const result = await metaLeadsBackfill(db, deps, now);
    expect(result).toMatchObject({ ok: true, data: { failed: 1, expired: 0 } });
    const [account] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));
    expect(account?.status).toBe("conectada");
    expect(account?.lastError).toContain("Meta 2");
    expect(deps.mailer.outbox).toHaveLength(0);
  });

  it("un token vencido marca la cuenta y avisa a Gerencia una sola vez", async () => {
    const accountId = await connectPage("5004", "Página vencida");
    routes = {
      "/5004/leadgen_forms": {
        status: 400,
        body: { error: { code: 190, message: "Error validating access token" } },
      },
    };
    const deps = makeDeps();
    const first = await metaLeadsBackfill(db, deps, now);
    expect(first).toMatchObject({ ok: true, data: { expired: 1 } });

    const [account] = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));
    expect(account?.status).toBe("expirada");
    expect(deps.mailer.outbox.map((m) => m.to[0]).sort()).toEqual([
      "g1@tekinsof.com",
      "g2@tekinsof.com",
    ]);
    expect(deps.mailer.outbox[0]?.subject).toBe("Token de Meta vencido: Página vencida");
    expect(deps.mailer.outbox[0]?.html).toContain("/configuracion/integraciones/facebook");
    expect(JSON.stringify(deps.mailer.outbox)).not.toContain(TOKEN);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "integration.token_expired"),
          eq(auditEvents.targetId, accountId),
        ),
      );
    expect(audit).toHaveLength(1);

    const second = await metaLeadsBackfill(db, deps, now);
    expect(second).toMatchObject({ ok: true, data: { pages: 0, expired: 0 } });
    expect(deps.mailer.outbox).toHaveLength(2);
  });

  it("un 401 al leer los leads también cuenta como token vencido", async () => {
    const accountId = await connectPage("5005", "Página revocada");
    routes = {
      "/5005/leadgen_forms": { body: { data: [{ id: "form-5" }] } },
      "/form-5/leads": { status: 401, body: {} },
    };
    const result = await metaLeadsBackfill(db, makeDeps(), now);
    expect(result).toMatchObject({ ok: true, data: { expired: 1 } });
    const [account] = await db
      .select({ status: integrationAccounts.status })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));
    expect(account?.status).toBe("expirada");
  });
});

describe("purgeInboundEvents", () => {
  it("borra los eventos de más de 90 días y conserva los recientes", async () => {
    const day = 24 * 60 * 60 * 1000;
    const event = (externalId: string, ageDays: number) => ({
      provider: "meta",
      eventType: "leadgen",
      externalId,
      payload: {},
      signatureValid: true,
      receivedAt: new Date(now.getTime() - ageDays * day),
    });
    await db
      .insert(inboundEvents)
      .values([event("old-1", 91), event("old-2", 200), event("edge", 89), event("new", 1)]);

    const result = await purgeInboundEvents(db, now);
    expect(result).toEqual({ ok: true, data: { deleted: 2 } });
    const left = await db.select({ externalId: inboundEvents.externalId }).from(inboundEvents);
    expect(left.map((row) => row.externalId).sort()).toEqual(["edge", "new"]);
  });
});
