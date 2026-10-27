import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

test("gerencia invita a un vendedor y aparece en pendientes", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto("/configuracion/usuarios");
  await page.getByLabel("Correo").fill("nuevo.vendedor@tekinsof.com");
  await page.getByLabel("Rol", { exact: true }).selectOption("ventas");
  await page.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByText("Invitación creada")).toBeVisible();
  const pending = page.getByRole("table", { name: "Invitaciones pendientes" });
  await expect(pending.getByRole("cell", { name: "nuevo.vendedor@tekinsof.com" })).toBeVisible();
});

test("invitar fuera del dominio muestra Dominio no permitido", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto("/configuracion/usuarios");
  await page.getByLabel("Correo").fill("alguien@gmail.com");
  await page.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Dominio no permitido" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "alguien@gmail.com" })).toHaveCount(0);
});

test("ventas recibe 404 en /configuracion/usuarios", async ({ page }) => {
  await loginAs(page, "ventas");
  const res = await page.goto("/configuracion/usuarios");
  expect(res?.status()).toBe(404);
});

test("/configuracion/usuarios sin violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto("/configuracion/usuarios");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
