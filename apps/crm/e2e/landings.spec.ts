import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

test.describe.configure({ mode: "serial" });

let editorUrl = "";

async function expectNoSeriousViolations(page: Parameters<typeof loginAs>[0]) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
}

test("marketing crea, valida y publica una landing", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/landings");
  await page.getByText("Nueva landing").click();
  await page.getByLabel("Título", { exact: true }).fill("ERP para distribuidoras");
  await page.getByLabel("Slug (URL /lp/…)").fill("e2e-erp-distribuidoras");
  await page.getByRole("button", { name: "Crear landing" }).click();
  await expect(page).toHaveURL(/\/landings\/[0-9a-f-]{36}$/);
  editorUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("region", { name: "Vista previa" })).toContainText(
    "Título de la landing",
  );

  await page.locator("#b0-title").fill("x".repeat(91));
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/e_blocks\.0\.title=/);
  await expect(page.locator("#b0-title")).toHaveAttribute("aria-invalid", "true");
  // React resets the form once the action settles; type only after it is back to the saved value.
  await expect(page.locator("#b0-title")).toHaveValue("Título de la landing");

  await page.locator("#b0-title").fill("Integra tu ERP en semanas");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Publicada: el sitio se regenerará en unos minutos")).toBeVisible();
  await expect(page.getByRole("region", { name: "Vista previa" })).toContainText(
    "Integra tu ERP en semanas",
  );
});

test("la lista de landings no tiene violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto("/landings");
  await expect(page.getByRole("link", { name: "ERP para distribuidoras" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("el editor de landings no tiene violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "marketing");
  await page.goto(editorUrl);
  await expectNoSeriousViolations(page);
});
