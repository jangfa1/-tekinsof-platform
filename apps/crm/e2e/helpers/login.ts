import { expect, type Page } from "@playwright/test";

export type E2eRole = "gerencia" | "ventas" | "marketing" | "administracion";

// Signs a fresh user in through Better Auth's email+password endpoint, which exists only while
// AUTH_TEST_MODE=1 (see playwright.config.ts). The session cookie lands in the page's context.
export async function loginAs(page: Page, role: E2eRole): Promise<string> {
  const email =
    role === "gerencia"
      ? "gerencia@e2e.tekinsof.test"
      : `${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.tekinsof.test`;
  const password = "e2e-password-123456";
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: `E2E ${role}`, email, password, role },
  });
  if (signUp.status() !== 200) {
    const signIn = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    expect(signIn.status()).toBe(200);
  }
  return email;
}
