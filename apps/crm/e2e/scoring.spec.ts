import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = "/configuracion/calificacion";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe.configure({ mode: "serial" });

// Unique per run: the E2E database persists between runs.
const name = `Calificada ${Date.now()}`;
let leadUrl = "";

test("el dueño completa la calificación y ve el grado con su explicación", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads/nuevo");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Teléfono").fill("987650001");
  await page.getByRole("button", { name: "Registrar lead" }).click();
  await expect(page).toHaveURL(new RegExp(`/leads/${UUID}$`));
  leadUrl = page.url();

  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Calificación" }),
  });
  await expect(card).toContainText("aún no tiene calificación");

  await page.getByLabel("Tamaño de la empresa").selectOption("201+");
  await page.getByLabel("Presupuesto estimado").selectOption("mas-50k");
  await page.getByLabel("Tipo de organización").selectOption("privada");
  await page.getByRole("button", { name: "Guardar y recalificar" }).click();

  // 10 WhatsApp + 20 budget + 15 size + 10 type = 55 → B.
  await expect(page.getByRole("status").filter({ hasText: "Calificación: B" })).toBeVisible();
  await expect(card).toContainText("55 de 100 puntos");
  await expect(card).toContainText("Más de S/ 50,000");
  await expect(card).toContainText("Servicio: no indicado");
  await expect(card).toContainText("Correo: no indicado");
  await expectNoAxeViolations(page);
});

test("la bandeja muestra el grado y filtra por él", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads?grado=B");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("B");
  await expectNoAxeViolations(page);

  await page.goto("/leads?grado=A");
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("gerencia ve las reglas activas y recalifica los leads", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(PATH);
  await expect(
    page.getByRole("heading", { name: "Calificación de leads", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Reglas activas · versión 1/ })).toBeVisible();
  await expect(page.getByText("desde 75 pts")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Recalificar leads" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Se recalificaron \d+ leads/ }),
  ).toBeVisible();

  // The lead keeps its grade and gains a history row; the page still shows it.
  await page.goto(leadUrl);
  await expect(page.getByText("55 de 100 puntos")).toBeVisible();
});

test("ventas recibe 404 en la configuración de calificación", async ({ page }) => {
  await loginAs(page, "ventas");
  const res = await page.goto(PATH);
  expect(res?.status()).toBe(404);
});
