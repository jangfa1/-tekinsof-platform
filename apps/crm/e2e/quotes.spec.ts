import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

test.describe.configure({ mode: "serial" });

let quoteUrl = "";

test("un vendedor emite una cotización con 15% y queda pendiente de aprobación", async ({
  page,
}) => {
  await loginAs(page, "ventas");
  await page.goto("/oportunidades");
  await page.getByText("Nueva oportunidad").click();
  await page.getByLabel("Título").fill("Portal de clientes");
  await page.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);

  await page.goto("/cotizaciones");
  await page.getByText("Nueva cotización").click();
  await page.getByLabel("Oportunidad").selectOption({ label: "Portal de clientes" });
  await page.getByLabel("Moneda").selectOption("PEN");
  await page.getByRole("button", { name: "Crear cotización" }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
  quoteUrl = new URL(page.url()).pathname;

  await page.getByLabel("Descripción del ítem 1").fill("Desarrollo a medida");
  await page.getByLabel("Cantidad del ítem 1").fill("1");
  await page.getByLabel("Precio unitario del ítem 1").fill("1000.00");
  await page.getByLabel("Descuento %").fill("15");
  await page.getByRole("button", { name: "Emitir" }).click();

  await expect(page.getByText("Pendiente de aprobación", { exact: true })).toBeVisible();
  const totals = page.locator("dl").last();
  await expect(totals).toContainText("Subtotal");
  await expect(totals).toContainText("S/ 1,000.00");
  await expect(totals).toContainText("S/ 153.00");
  await expect(totals).toContainText("S/ 1,003.00");
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
});

test("gerencia aprueba la cotización", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, "gerencia");
  await page.goto(quoteUrl);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Aprobada", { exact: true })).toBeVisible();
  await context.close();
});

test("marketing publica un servicio del catálogo", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/catalogo");
  await page.getByText("Nuevo servicio").click();
  await page.getByLabel("Código").fill("E2E-SEO");
  await page.getByLabel("Nombre").fill("SEO de prueba");
  await page.getByLabel("Slug (URL)").fill("seo-de-prueba");
  await page.getByLabel("Categoría").selectOption("marketing");
  await page.getByRole("button", { name: "Crear servicio" }).click();
  const row = page.getByRole("row", { name: /SEO de prueba/ });
  await expect(row).toContainText("Oculto");
  await row.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("row", { name: /SEO de prueba/ })).toContainText("Publicado");
});

test("el editor de cotizaciones no tiene violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(quoteUrl);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
