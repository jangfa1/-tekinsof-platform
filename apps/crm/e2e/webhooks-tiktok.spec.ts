import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

// Secret matches playwright.config.ts.
const SECRET = "e2e-tiktok-webhook-secret";
const URL = "/api/webhooks/tiktok";

type Body = {
  ok: boolean;
  data?: { inboundEventId: string; duplicate: boolean };
  error?: { code: string };
};

const payload = (leadId: string) =>
  JSON.stringify({
    lead_id: leadId,
    form_id: "tt-form-e2e",
    campaign_id: "tt-camp-e2e",
    created_time: 1761836400,
    fields: { name: "Carla Ríos", email: "carla@retail.pe", rubro: "Comercio" },
  });

const sign = (raw: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

const json = { "content-type": "application/json" };

test("sin firma o con firma equivocada responde 401 y no guarda nada", async ({ request }) => {
  const raw = payload("tt-e2e-unsigned");
  const unsigned = await request.post(URL, { headers: json, data: raw });
  expect(unsigned.status()).toBe(401);
  const wrong = await request.post(URL, {
    headers: { ...json, "x-tekinsof-signature": sign(raw, "otro-secreto") },
    data: raw,
  });
  expect(wrong.status()).toBe(401);
  expect(((await wrong.json()) as Body).error?.code).toBe("UNAUTHENTICATED");

  // Had either attempt been stored, the signed delivery below would come back as a duplicate.
  const signed = await request.post(URL, {
    headers: { ...json, "x-tekinsof-signature": sign(raw) },
    data: raw,
  });
  expect(signed.status()).toBe(200);
  expect(((await signed.json()) as Body).data?.duplicate).toBe(false);
});

test("un lead firmado responde 200 y el reenvío se marca duplicado", async ({ request }) => {
  const raw = payload("tt-e2e-1");
  const headers = { ...json, "x-tekinsof-signature": sign(raw) };
  const first = await request.post(URL, { headers, data: raw });
  expect(first.status()).toBe(200);
  const firstBody = (await first.json()) as Body;
  expect(firstBody.data?.duplicate).toBe(false);

  const again = await request.post(URL, { headers, data: raw });
  const againBody = (await again.json()) as Body;
  expect(againBody.data?.duplicate).toBe(true);
  expect(againBody.data?.inboundEventId).toBe(firstBody.data?.inboundEventId);
});

test("un cuerpo firmado sin lead_id responde 400", async ({ request }) => {
  const raw = JSON.stringify({ form_id: "tt-form-e2e", created_time: 1 });
  const res = await request.post(URL, {
    headers: { ...json, "x-tekinsof-signature": sign(raw) },
    data: raw,
  });
  expect(res.status()).toBe(400);
});
