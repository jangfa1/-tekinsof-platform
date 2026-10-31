import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { E2E_DASHBOARD_MONTH } from "./helpers/fixtures";
import { loginAs } from "./helpers/login";

const september = `/marketing?${new URLSearchParams(E2E_DASHBOARD_MONTH)}`;

// A stat tile by its label: <div><dt>Leads</dt><dd>6</dd>…</div>.
const tile = (page: Page, label: string) =>
  page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
const answer = (page: Page, question: string) =>
  page.getByRole("listitem").filter({ hasText: question });

test("marketing ve el dashboard con sus secciones y respuestas", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto(september);
  await expect(page.getByRole("heading", { name: "Marketing", level: 1 })).toBeVisible();
  for (const name of ["Leads por fuente", "Rendimiento por campaña", "Embudo comercial"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  await expect(tile(page, "Leads")).toContainText("6");
  await expect(answer(page, "Plataforma con más leads")).toContainText("Instagram");
  await expect(answer(page, "Mejor costo por lead")).toContainText("Facebook");
  await expect(answer(page, "Mejor costo por lead")).toContainText("S/ 20");
  // No sales in the month: nobody "converts best".
  await expect(answer(page, "Mejor conversión a venta")).toContainText("Sin datos suficientes");

  const platforms = page.getByRole("table", { name: "Rendimiento por plataforma" });
  await expect(platforms.getByRole("row", { name: /Instagram/ })).toContainText("S/ 30.00");
  await expect(page.getByRole("img", { name: /Leads por plataforma/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("filtrar por plataforma cambia los totales", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto(`${september}&plataforma=instagram`);
  await expect(tile(page, "Leads")).toContainText("3");
  await expect(tile(page, "Costo por lead")).toContainText("S/ 30");
});

test("el filtro por vendedor avisa que el gasto no se puede separar", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto(`${september}&vendedor=nadie`);
  await expect(page.getByRole("note")).toContainText("El gasto no se puede separar");
});

test("un rango sin leads muestra el estado vacío", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/marketing?desde=2020-01-01&hasta=2020-01-31");
  await expect(page.getByText("Sin leads en este rango")).toBeVisible();
});

test("los accesos rápidos de periodo quedan en la URL", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/marketing");
  await expect(page.getByRole("link", { name: "Este mes", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(/periodo=mes-anterior/);
  await expect(page.getByRole("link", { name: "Mes anterior" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("ventas recibe 404 y no ve Marketing en el menú", async ({ page }) => {
  await loginAs(page, "ventas");
  const res = await page.goto("/marketing");
  expect(res?.status()).toBe(404);
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Marketing" })).toHaveCount(0);
});
