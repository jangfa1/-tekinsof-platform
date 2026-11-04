import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { E2E_META_CAMPAIGN } from "./helpers/fixtures";
import { loginAs } from "./helpers/login";

const AD_TOKEN = "EAAE2eAdsReadToken0123456789abcdef";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("marketing ve la alerta de una campaña de Meta sin asociar y la asocia", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/campanas");
  await expect(page.getByRole("heading", { name: "Campañas", level: 1 })).toBeVisible();
  const alert = page.getByRole("region", { name: "1 campaña de Meta sin asociar" });
  await expect(alert).toContainText("Meta — Prospección ERP");
  await expect(alert).toContainText("S/ 173.45");
  await expectNoAxeViolations(page);

  await page.getByLabel("Campaña del CRM").selectOption({ label: "Campaña E2E Meta" });
  await page.getByRole("button", { name: "Asociar" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 registros de gasto recuperados" }),
  ).toBeVisible();
  await expect(page.getByText("campaña de Meta sin asociar")).toHaveCount(0);
  const row = page.getByRole("row", { name: /Campaña E2E Meta/ });
  await expect(row).toContainText("1 asociada");
});

test("marketing registra gasto manual de Google y ve el gasto recuperado de Meta", async ({
  page,
}) => {
  await loginAs(page, "marketing");
  await page.goto("/campanas");
  await page.getByRole("link", { name: "Campaña E2E Meta" }).click();
  await expect(page.getByRole("heading", { name: "Campaña E2E Meta", level: 1 })).toBeVisible();
  await expect(page.getByText(E2E_META_CAMPAIGN)).toBeVisible();
  const history = page.getByRole("table", { name: "Gasto diario de la campaña" });
  await expect(history.getByRole("row", { name: /Facebook.*Meta \(automático\)/ })).toContainText(
    "S/ 123.45",
  );
  await expect(history.getByRole("row", { name: /Instagram/ })).toContainText("S/ 50.00");

  await page.getByLabel("Plataforma").selectOption("google");
  await page.getByLabel("Monto").fill("1250.50");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gasto registrado" })).toBeVisible();
  await expect(history.getByRole("row", { name: /Google.*Manual/ })).toContainText("S/ 1,250.50");
  await expectNoAxeViolations(page);
});

test("un monto negativo muestra el error en el campo", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/campanas");
  await page.getByRole("link", { name: "Campaña E2E Meta" }).click();
  await page.getByLabel("Monto").fill("-20");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El monto no puede ser negativo" }),
  ).toBeVisible();
});

test("ventas recibe 404 en Campañas y no la ve en el menú", async ({ page }) => {
  await loginAs(page, "ventas");
  const res = await page.goto("/campanas");
  expect(res?.status()).toBe(404);
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Campañas" })).toHaveCount(0);
});

test("gerencia conecta la cuenta publicitaria de Meta sin volver a ver el token", async ({
  page,
}) => {
  await loginAs(page, "gerencia");
  await page.goto("/configuracion/integraciones/facebook");
  await page.getByLabel("ID de la cuenta publicitaria").fill("act_2026103101");
  await page.getByLabel("Nombre de la cuenta publicitaria").fill("Cuenta E2E");
  await page.getByLabel("Token con permiso ads_read").fill(AD_TOKEN);
  await page.getByRole("button", { name: "Conectar cuenta publicitaria" }).click();

  await expect(page.getByText("Cuenta publicitaria conectada")).toBeVisible();
  const table = page.getByRole("table", { name: "Cuentas publicitarias de Meta conectadas" });
  await expect(table).toContainText("act_2026103101");
  // An ad account is not a Page: it never shows up among the Pages that receive leads.
  await expect(
    page.getByRole("table", { name: "Páginas de Facebook conectadas" }).getByText("Cuenta E2E"),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain(AD_TOKEN);
  await expectNoAxeViolations(page);
});
