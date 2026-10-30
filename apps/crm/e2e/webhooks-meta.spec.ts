import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { parseEnv } from "../src/lib/env";

// Secrets match playwright.config.ts.
const APP_SECRET = "e2e-meta-app-secret";
const VERIFY_TOKEN = "e2e-meta-verify-token";
const URL = "/api/webhooks/meta";

type Body = {
  ok: boolean;
  data?: { received: number; inboundEventIds: string[]; duplicate: boolean };
  error?: { code: string };
};

const payload = (leadgenId: string) =>
  JSON.stringify({
    object: "page",
    entry: [
      {
        id: "1010",
        time: 1761836400,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadgenId,
              page_id: "1010",
              form_id: "form-e2e",
              ad_id: "ad-e2e",
              adgroup_id: "adset-e2e",
              created_time: 1761836400,
            },
          },
        ],
      },
    ],
  });

const sign = (raw: string, secret = APP_SECRET) =>
  `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

test("la verificación de la suscripción devuelve hub.challenge", async ({ request }) => {
  const res = await request.get(
    `${URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
  );
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("12345");
});

test("un verify token equivocado responde 403", async ({ request }) => {
  const res = await request.get(
    `${URL}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345`,
  );
  expect(res.status()).toBe(403);
});

test("sin firma o con firma equivocada responde 401 y no guarda nada", async ({ request }) => {
  const raw = payload("lead-e2e-unsigned");
  const headers = { "content-type": "application/json" };
  const unsigned = await request.post(URL, { headers, data: raw });
  expect(unsigned.status()).toBe(401);
  const wrong = await request.post(URL, {
    headers: { ...headers, "x-hub-signature-256": sign(raw, "otro-secreto") },
    data: raw,
  });
  expect(wrong.status()).toBe(401);
  expect(((await wrong.json()) as Body).error?.code).toBe("UNAUTHENTICATED");

  // Had either attempt been stored, the signed delivery below would come back as a duplicate.
  const signed = await request.post(URL, {
    headers: { ...headers, "x-hub-signature-256": sign(raw) },
    data: raw,
  });
  expect(((await signed.json()) as Body).data?.duplicate).toBe(false);
});

test("un leadgen firmado responde 200 y el reenvío se marca duplicado", async ({ request }) => {
  const raw = payload("lead-e2e-1");
  const headers = { "content-type": "application/json", "x-hub-signature-256": sign(raw) };

  const first = await request.post(URL, { headers, data: raw });
  expect(first.status()).toBe(200);
  const firstBody = (await first.json()) as Body;
  expect(firstBody.data?.received).toBe(1);
  expect(firstBody.data?.duplicate).toBe(false);

  const again = await request.post(URL, { headers, data: raw });
  expect(again.status()).toBe(200);
  const againBody = (await again.json()) as Body;
  expect(againBody.data?.duplicate).toBe(true);
  expect(againBody.data?.inboundEventIds).toEqual(firstBody.data?.inboundEventIds);
});

test("parseEnv exige META_APP_SECRET en producción", () => {
  expect(() =>
    parseEnv({
      DATABASE_URL: "pglite://memory",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "https://crm.tekinsof.com",
      CRM_BOOTSTRAP_ADMIN_EMAIL: "g@tekinsof.com",
      VERCEL_ENV: "production",
    }),
  ).toThrow(/META_APP_SECRET/);
});
