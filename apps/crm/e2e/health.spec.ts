import { expect, test } from "@playwright/test";

test("GET /api/health responde 200 con status ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string; service: string };
  expect(body.status).toBe("ok");
  expect(body.service).toBe("crm");
});

test("una ruta inexistente responde 404", async ({ request }) => {
  const res = await request.get("/ruta-que-no-existe");
  expect(res.status()).toBe(404);
});
