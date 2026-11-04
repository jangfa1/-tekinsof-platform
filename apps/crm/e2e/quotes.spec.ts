import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

test.describe.configure({ mode: "serial" });

let quoteUrl = "";

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
}

test("un vendedor arma productos, servicios y condiciones; con 15% queda pendiente", async ({
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

  // The defaults are already in the draft.
  await expect(page.getByLabel("Mensaje de presentación")).toHaveValue(/Estimados señores/);

  await page.getByLabel("Tipo del producto 1").selectOption("licencia");
  await page.getByLabel("Part number del producto 1").fill("M365-BP");
  await page.getByLabel("Descripción del producto 1").fill("Microsoft 365 Business Premium");
  await page.getByLabel("Cantidad del producto 1").fill("10");
  await page.getByLabel("Precio unitario del producto 1").fill("50.00");
  await page.getByLabel("Tipo del servicio 1").selectOption("desarrollo");
  await page.getByLabel("Descripción del servicio 1").fill("Desarrollo a medida");
  await page.getByLabel("Cantidad del servicio 1").fill("1");
  await page.getByLabel("Precio unitario del servicio 1").fill("1000.00");
  await page.getByLabel("Forma de pago").fill("Contado contra entrega");
  await page.getByLabel("Descuento %").fill("15");
  await page.getByRole("button", { name: "Emitir" }).click();

  await expect(page.getByText("Pendiente de aprobación", { exact: true })).toBeVisible();
  // 500 + 1000 = 1500; −15% = 1275; IGV 229.50; total 1504.50.
  const totals = page.locator("dl", { hasText: "Subtotal general" });
  await expect(totals).toContainText("S/ 500.00");
  await expect(totals).toContainText("S/ 1,000.00");
  await expect(totals).toContainText("S/ 1,500.00");
  await expect(totals).toContainText("S/ 229.50");
  await expect(totals).toContainText("S/ 1,504.50");
  await expect(page.getByRole("cell", { name: "M365-BP" })).toBeVisible();
  await expect(page.getByText("Contado contra entrega")).toBeVisible();
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

test("enviar por WhatsApp descarga el PDF, abre el chat y la deja enviada", async ({
  page,
  context,
}) => {
  // wa.me is external: answer it locally and keep the URL the button opened.
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ contentType: "text/plain", body: "whatsapp" }),
  );
  await loginAs(page, "gerencia");
  await page.goto(quoteUrl);
  const download = page.waitForEvent("download");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Enviar por WhatsApp" }).click();
  expect((await download).suggestedFilename()).toMatch(/^CT-\d{4}-\d{5}-v1\.pdf$/);
  const chat = await popup;
  await chat.waitForURL(/^https:\/\/wa\.me\//);
  expect(decodeURIComponent(chat.url())).toContain("S/ 1,504.50");
  await expect(page.getByText(/PDF descargado/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Enviada", { exact: true })).toBeVisible();
});

test("el PDF de la cotización es un PDF real", async ({ page }) => {
  await loginAs(page, "gerencia");
  const response = await page.request.get(`/api${quoteUrl}/pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
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
  await expectNoSeriousViolations(page);
  await page.goto("/cotizaciones");
  await page.getByText("Nueva cotización").click();
  await page.getByLabel("Oportunidad").selectOption({ label: "Portal de clientes" });
  await page.getByRole("button", { name: "Crear cotización" }).click();
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("gerencia edita los textos por defecto de las cotizaciones", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto("/configuracion/cotizaciones");
  await expect(page.getByRole("heading", { name: "Textos de cotización" })).toBeVisible();
  await page.getByLabel("Tiempo de entrega").fill("15 días hábiles");
  await page.getByRole("button", { name: "Guardar textos" }).click();
  await expect(page.getByText(/Textos guardados/)).toBeVisible();
  await expect(page.getByLabel("Tiempo de entrega")).toHaveValue("15 días hábiles");
  await expectNoSeriousViolations(page);
});

test("ventas no ve los textos por defecto", async ({ page }) => {
  await loginAs(page, "ventas");
  const response = await page.goto("/configuracion/cotizaciones");
  expect(response?.status()).toBe(404);
});

test("un vendedor guarda su firma", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/configuracion/firma");
  await page.getByLabel("Cargo").fill("Ejecutiva comercial");
  await page.getByLabel("Teléfono").fill("+51 999 888 777");
  await page.getByRole("button", { name: "Guardar firma" }).click();
  await expect(page.getByText("Firma guardada")).toBeVisible();
  await expect(page.getByLabel("Cargo")).toHaveValue("Ejecutiva comercial");
  await expectNoSeriousViolations(page);
});
