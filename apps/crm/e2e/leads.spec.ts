import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

async function quickAdd(page: Page, name: string, phone: string): Promise<string> {
  await page.goto("/leads/nuevo");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Teléfono").fill(phone);
  await page.getByRole("button", { name: "Registrar lead" }).click();
  await expect(page).toHaveURL(new RegExp(`/leads/${UUID}$`));
  return page.url();
}

test.describe.configure({ mode: "serial" });

let leadUrl = "";

test("un ventas registra un lead de WhatsApp y llega a su detalle", async ({ page }) => {
  await loginAs(page, "ventas");
  leadUrl = await quickAdd(page, "Carlos Quispe", "987654321");
  const data = page.locator("dl").first();
  await expect(data).toContainText("WhatsApp");
  await expect(data).toContainText("+51987654321");
});

test("el lead aparece en Mis leads", async ({ page }) => {
  await loginAs(page, "ventas");
  await quickAdd(page, "Lucía Mendoza", "987654300");
  await page.goto("/leads?dueno=mios");
  await expect(page.getByRole("link", { name: "Lucía Mendoza" })).toBeVisible();
});

test("pasar a Contactado muestra el badge", async ({ page }) => {
  await loginAs(page, "ventas");
  await quickAdd(page, "Jorge Ramos", "987654301");
  await page.getByLabel("Nuevo estado").selectOption("contactado");
  await page.getByRole("button", { name: "Guardar estado" }).click();
  await expect(page.getByText("Estado actualizado")).toBeVisible();
  await expect(page.locator("h1 + span", { hasText: "Contactado" })).toBeVisible();
});

test("descartar sin motivo muestra Indica el motivo", async ({ page }) => {
  await loginAs(page, "ventas");
  await quickAdd(page, "Elena Paz", "987654302");
  await page.getByLabel("Nuevo estado").selectOption("descartado");
  await page.getByRole("button", { name: "Guardar estado" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Indica el motivo" })).toBeVisible();
  await expect(page.locator("h1 + span", { hasText: "Nuevo" })).toBeVisible();
});

test("un lead del endpoint público aparece para gerencia como Formulario web", async ({ page }) => {
  await loginAs(page, "gerencia");
  const res = await page.request.post("/api/public/leads", {
    headers: { Origin: "http://localhost:4321" },
    data: {
      fullName: "Prospecto Web",
      email: `web.${Date.now()}@empresa.pe`,
      consent: true,
      consentVersion: "2026-10",
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
      website: "",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/leads");
  const row = page.getByRole("row", { name: /Prospecto Web/ });
  await expect(row).toContainText("Formulario web");
});

test("/leads sin violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads");
  expect(leadUrl).not.toBe("");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
