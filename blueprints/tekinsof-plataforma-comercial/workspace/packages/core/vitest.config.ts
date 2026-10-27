import { defineConfig } from "vitest/config";

// Tests run against an in-memory PGlite created per test file (src/db/client.ts → createDb("pglite://memory")).
// No env file is read here: tests must never depend on .env or on a running service.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/blueprints/**"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
