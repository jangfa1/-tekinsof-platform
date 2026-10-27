import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs schema.ts against drizzle/ — it never connects to a database,
// so no env loading is needed here. Applying migrations is scripts/migrate.ts's job.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
});
