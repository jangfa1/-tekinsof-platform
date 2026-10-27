import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";

test("sin sesión, /leads redirige a /login", async ({ page }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login/);
});

test("ventas ve Leads y no ve Usuarios", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads");
  const nav = page.getByRole("navigation", { name: "Principal", exact: true });
  await expect(nav.getByRole("link", { name: "Leads" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
});

test("gerencia ve Usuarios", async ({ page }) => {
  await loginAs(page, "gerencia");
  await page.goto("/leads");
  const nav = page.getByRole("navigation", { name: "Principal", exact: true });
  await expect(nav.getByRole("link", { name: "Usuarios" })).toBeVisible();
});

test("el tema oscuro se sirve en el HTML inicial tras recargar", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads");
  await page.getByRole("button", { name: "Oscuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const html = await (await page.request.get("/leads")).text();
  expect(html).toMatch(/<html[^>]*class="dark"/);
});

test("/leads sin violaciones de accesibilidad serias", async ({ page }) => {
  await loginAs(page, "ventas");
  await page.goto("/leads");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
