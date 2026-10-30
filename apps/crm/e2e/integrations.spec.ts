import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

const PATH = "/configuracion/integraciones";
const META_TOKEN = "EAAE2eSystemUserToken0123456789abcdef";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("gerencia ve las integraciones activas y las próximas", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(PATH);
  await expect(page.getByRole("heading", { name: "Integraciones", level: 1 })).toBeVisible();
  for (const name of [
    "Facebook Lead Ads",
    "Instagram Lead Ads",
    "Google Lead Forms",
    "TikTok Lead Ads",
    "WhatsApp Business Cloud API",
    "Microsoft Bookings",
  ]) {
    await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
  }
  await expect(page.getByText("Próximamente").first()).toBeVisible();
});

test("gerencia conecta una Página de Meta sin que el token vuelva a mostrarse", async ({
  page,
}) => {
  await loginAs(page, "gerencia");
  await page.goto(`${PATH}/facebook`);
  await page.getByLabel("ID de la Página").fill("2026103001");
  await page.getByLabel("Nombre de la Página").fill("Página E2E");
  await page.getByLabel("Token del usuario del sistema").fill(META_TOKEN);
  await page.getByRole("button", { name: "Conectar Página" }).click();

  await expect(page.getByText("Página conectada")).toBeVisible();
  const accounts = page.getByRole("table", { name: "Páginas de Facebook conectadas" });
  await expect(accounts.getByText("Página E2E")).toBeVisible();
  await expect(accounts.locator("tbody").getByText("Conectada", { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(META_TOKEN);
  expect(page.url()).not.toContain(META_TOKEN);
});

test("un ID de Página con letras muestra el error del campo", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(`${PATH}/facebook`);
  await page.getByLabel("ID de la Página").fill("pagina");
  await page.getByLabel("Nombre de la Página").fill("Mal");
  await page.getByLabel("Token del usuario del sistema").fill(META_TOKEN);
  await page.getByRole("button", { name: "Conectar Página" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El ID de la Página solo tiene números" }),
  ).toBeVisible();
});

test("la clave de un formulario de Google se muestra una sola vez", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(`${PATH}/google`);
  await page.getByLabel("Nombre del formulario").fill("Google E2E — ERP");
  await page.getByRole("button", { name: "Crear formulario" }).click();

  const created = page.getByRole("status").filter({ hasText: "creado" });
  await expect(created).toBeVisible();
  await expect(created.getByText(/\/api\/webhooks\/google-leads\/[0-9a-f-]{36}/)).toBeVisible();
  const key = (await created.locator("code").nth(1).textContent()) ?? "";
  expect(key.length).toBeGreaterThan(20);

  await page.reload();
  await expect(page.getByRole("cell", { name: /^Google E2E — ERP / })).toBeVisible();
  expect(await page.content()).not.toContain(key);
});

test("un lead de prueba de TikTok recorre el camino completo", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(`${PATH}?tab=pruebas`);
  await page.getByLabel("Integración").selectOption("tiktok");
  await page.getByRole("button", { name: "Enviar lead de prueba" }).click();
  const result = page.getByRole("status").filter({ hasText: "Lead creado" });
  await expect(result).toContainText("Firma HMAC: correcto");
  await expect(result).toContainText("Lead creado: correcto");
  await expect(result.getByRole("link", { name: "Ver el lead de prueba" })).toBeVisible();

  await page.reload();
  const log = page.getByRole("table", { name: "Registro de eventos de webhooks" });
  await expect(log.getByText("procesado").first()).toBeVisible();
});

for (const role of ["marketing", "ventas"] as const) {
  test(`${role} recibe 404 en las integraciones`, async ({ page }) => {
    await loginAs(page, role);
    expect((await page.goto(PATH))?.status()).toBe(404);
    expect((await page.goto(`${PATH}/facebook`))?.status()).toBe(404);
  });
}

test("una integración desconocida o próxima responde 404", async ({ page }) => {
  await loginAs(page, "gerencia");
  expect((await page.goto(`${PATH}/whatsapp`))?.status()).toBe(404);
});

for (const path of [
  PATH,
  `${PATH}?tab=pruebas`,
  `${PATH}/facebook`,
  `${PATH}/google`,
  `${PATH}/tiktok`,
]) {
  test(`${path} sin violaciones de accesibilidad`, async ({ page }) => {
    await loginAs(page, "gerencia");
    await page.goto(path);
    await expectNoAxeViolations(page);
  });
}
