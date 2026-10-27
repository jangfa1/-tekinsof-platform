import { rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E runs the production build (`next start`) against a throwaway PGlite directory, so no
// Postgres, no Entra and no network are needed. AUTH_TEST_MODE enables email+password sign-up for
// @e2e.tekinsof.test addresses only; src/lib/env.ts refuses it when VERCEL_ENV is production.
const dataDir = join(process.cwd(), "../../.data/e2e");
if (!process.env.TEST_WORKER_INDEX) rmSync(dataDir, { recursive: true, force: true });

const env: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: `pglite://${dataDir}`,
  BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0001",
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_TEST_MODE: "1",
  ALLOWED_EMAIL_DOMAIN: "tekinsof.com",
  CRM_BOOTSTRAP_ADMIN_EMAIL: "gerencia@e2e.tekinsof.test",
  SITE_ORIGIN: "http://localhost:4321",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  MAIL_DRIVER: "log",
  STORAGE_DRIVER: "local",
  INNGEST_DEV: "1",
  CRM_BASE_URL: "http://localhost:3000",
};

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/helpers/**", "**/blueprints/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node ../../packages/core/scripts/migrate.ts && pnpm exec next start -p 3000",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
});
