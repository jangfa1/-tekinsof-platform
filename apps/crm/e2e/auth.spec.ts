import { expect, test } from "@playwright/test";
import { parseEnv } from "../src/lib/env";
import { loginAs } from "./helpers/login";

test("el email de bootstrap entra como gerencia", async ({ page }) => {
  await loginAs(page, "gerencia");
  const res = await page.request.get("/api/auth/get-session");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { user: { role: string } };
  expect(body.user.role).toBe("gerencia");
});

test("un correo ajeno al dominio no puede registrarse", async ({ request }) => {
  const res = await request.post("/api/auth/sign-up/email", {
    data: { name: "Intruso", email: "intruso@gmail.com", password: "intruso-password-123" },
  });
  expect(res.status()).not.toBe(200);
});

test("/login muestra el botón de Microsoft", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Entrar con Microsoft" })).toBeVisible();
});

test("/login?error muestra el aviso de acceso", async ({ page }) => {
  await page.goto("/login?error=x");
  // Next's route announcer is also role="alert"; filter to the page's own message.
  await expect(page.getByRole("alert").filter({ hasText: "no tiene acceso" })).toBeVisible();
});

test("parseEnv rechaza AUTH_TEST_MODE en producción", () => {
  expect(() =>
    parseEnv({
      DATABASE_URL: "pglite://memory",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
      CRM_BOOTSTRAP_ADMIN_EMAIL: "g@tekinsof.com",
      VERCEL_ENV: "production",
      AUTH_TEST_MODE: "1",
    }),
  ).toThrow(/AUTH_TEST_MODE/);
});
