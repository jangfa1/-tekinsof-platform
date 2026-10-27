import { expect, test } from "@playwright/test";

const SITE = "http://localhost:4321";
const headers = { Origin: SITE };
const email = `ana.${Date.now()}@empresa.pe`;
const lead = {
  fullName: "Ana Torres",
  email,
  consent: true,
  consentVersion: "2026-10",
  turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  website: "",
};

type Body = {
  ok: boolean;
  data?: { leadId: string | null; deduplicated: boolean };
  error?: { code: string; fields?: Record<string, string> };
};

let firstLeadId: string | null = null;

test("un lead válido responde 201 con un leadId UUID", async ({ request }) => {
  const res = await request.post("/api/public/leads", { headers, data: lead });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as Body;
  expect(body.data?.deduplicated).toBe(false);
  expect(body.data?.leadId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  firstLeadId = body.data?.leadId ?? null;
});

test("el mismo correo otra vez devuelve 200 deduplicado con el mismo leadId", async ({
  request,
}) => {
  const res = await request.post("/api/public/leads", { headers, data: lead });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Body;
  expect(body.data).toEqual({ leadId: firstLeadId, deduplicated: true });
});

test("un Origin ajeno responde 403 ORIGIN_NOT_ALLOWED", async ({ request }) => {
  const res = await request.post("/api/public/leads", {
    headers: { Origin: "https://evil.example" },
    data: { ...lead, email: "otro@empresa.pe" },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as Body).error?.code).toBe("ORIGIN_NOT_ALLOWED");
});

test("sin consentimiento responde 400 con fields.consent", async ({ request }) => {
  const res = await request.post("/api/public/leads", {
    headers,
    data: { ...lead, email: "sin.consentimiento@empresa.pe", consent: false },
  });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as Body;
  expect(body.error?.code).toBe("VALIDATION_ERROR");
  expect(body.error?.fields?.consent).toBeTruthy();
});

test("OPTIONS responde 204 con CORS para el sitio", async ({ request }) => {
  const res = await request.fetch("/api/public/leads", { method: "OPTIONS", headers });
  expect(res.status()).toBe(204);
  expect(res.headers()["access-control-allow-origin"]).toBe(SITE);
});

test("el honeypot responde 201 sin leadId", async ({ request }) => {
  const res = await request.post("/api/public/leads", {
    headers,
    data: { ...lead, email: "bot@spam.pe", website: "x" },
  });
  expect(res.status()).toBe(201);
  expect(((await res.json()) as Body).data?.leadId).toBeNull();
});
