// Applies every migration in packages/core/drizzle to DATABASE_URL (or DATABASE_URL_DIRECT when set).
// Self-contained on purpose: it imports nothing from src/, so it runs from step 1 onward, before any
// schema exists. `pglite://<path>` targets an embedded PGlite directory (relative paths resolve
// against the repository root); any postgres:// URL targets a real Postgres such as Supabase.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(coreDir, "../..");
const migrationsFolder = join(coreDir, "drizzle");

const envFile = join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "migrate: DATABASE_URL is not set (export it or add it to the repository-root .env)",
  );
  process.exit(1);
}

if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
  console.log("migrate: no migrations generated yet — nothing to apply");
  process.exit(0);
}

if (url.startsWith("pglite://")) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const target = url.slice("pglite://".length);
  const dataDir =
    target === "memory" ? undefined : isAbsolute(target) ? target : join(repoRoot, target);
  if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite does not create parent directories
  const client = new PGlite(dataDir);
  await migrate(drizzle({ client }), { migrationsFolder });
  await client.close();
} else {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle({ client }), { migrationsFolder });
  await client.end();
}
console.log("migrate: done");
