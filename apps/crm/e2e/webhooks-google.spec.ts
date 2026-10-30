import { expect, test } from "@playwright/test";
import { E2E_GOOGLE_FORM_ID, E2E_GOOGLE_KEY } from "./helpers/fixtures";

// The ad form is seeded by e2e/helpers/fixtures.ts before the server starts.
const URL = `/api/webhooks/google-leads/${E2E_GOOGLE_FORM_ID}`;

type Body = {
  ok: boolean;
  data?: { inboundEventId: string; duplicate: boolean };
  error?: { code: string };
};

const lead = (leadId: string, googleKey = E2E_GOOGLE_KEY) => ({
  lead_id: leadId,
  api_version: "1.0",
  form_id: "e2e-4455",
  campaign_id: 7788,
  gcl_id: "gclid-e2e",
  google_key: googleKey,
  is_test: true,
  user_column_data: [
    { column_name: "Nombre completo", string_value: "Rosa Huamán", column_id: "FULL_NAME" },
    { column_name: "Correo", string_value: "rosa@minera.pe", column_id: "EMAIL" },
  ],
});

test("una clave equivocada responde 401 y no guarda nada", async ({ request }) => {
  const wrong = await request.post(URL, { data: lead("g-e2e-bad", "otra-clave") });
  expect(wrong.status()).toBe(401);
  expect(((await wrong.json()) as Body).error?.code).toBe("UNAUTHENTICATED");

  // Had the rejected delivery been stored, this one would come back as a duplicate.
  const right = await request.post(URL, { data: lead("g-e2e-bad") });
  expect(right.status()).toBe(200);
  expect(((await right.json()) as Body).data?.duplicate).toBe(false);
});

test("un formulario desconocido responde 404", async ({ request }) => {
  const unknown = await request.post(
    "/api/webhooks/google-leads/00000000-0000-4000-8000-00000000ffff",
    { data: lead("g-e2e-404") },
  );
  expect(unknown.status()).toBe(404);
  const notUuid = await request.post("/api/webhooks/google-leads/no-es-uuid", {
    data: lead("g-e2e-404"),
  });
  expect(notUuid.status()).toBe(404);
});

test("un lead válido responde 200 y el reenvío se marca duplicado", async ({ request }) => {
  const first = await request.post(URL, { data: lead("g-e2e-1") });
  expect(first.status()).toBe(200);
  const firstBody = (await first.json()) as Body;
  expect(firstBody.data?.duplicate).toBe(false);

  const again = await request.post(URL, { data: lead("g-e2e-1") });
  const againBody = (await again.json()) as Body;
  expect(againBody.data?.duplicate).toBe(true);
  expect(againBody.data?.inboundEventId).toBe(firstBody.data?.inboundEventId);
});

test("un cuerpo que no es JSON responde 400", async ({ request }) => {
  const res = await request.post(URL, {
    headers: { "content-type": "application/json" },
    data: "{no-json",
  });
  expect(res.status()).toBe(400);
});
