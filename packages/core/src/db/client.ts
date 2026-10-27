// The only module that opens a database connection. Everything else receives a `Db` (or a `Tx`).
// `pglite://memory` → in-memory PGlite · `pglite://<dir>` → embedded PGlite on disk (local dev and
// E2E; relative dirs resolve against the repository root) · `postgres://…` → Postgres (Supabase
// pooler in production, opened with prepare:false for transaction-mode pooling).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export { schema };
export type Db = ReturnType<typeof drizzlePostgres<typeof schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(coreDir, "../..");
export const migrationsFolder = join(coreDir, "drizzle");

export function resolvePgliteDir(url: string): string | undefined {
  const target = url.slice("pglite://".length);
  if (target === "memory") return undefined;
  return isAbsolute(target) ? target : join(repoRoot, target);
}

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  if (url.startsWith("pglite://")) {
    const dataDir = resolvePgliteDir(url);
    if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite does not create parent directories
    const client = new PGlite(dataDir);
    const db = drizzlePglite({ client, schema, casing: "snake_case" });
    return { db: db as unknown as Db, close: () => client.close() };
  }
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzlePostgres({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end() };
}

// Tests only: a fresh in-memory PGlite with every migration in packages/core/drizzle applied.
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    throw new Error("No migrations found: run `pnpm db:generate` first");
  }
  const client = new PGlite();
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

const globalForDb = globalThis as unknown as { tekinsofDb?: Db };

// Process-wide singleton for the apps. Survives Next dev hot reloads via globalThis.
// During `next build` route modules are imported in parallel workers only to read their config;
// nothing may open the real database (or a shared PGlite directory) then, so the build gets an
// in-memory PGlite.
export function getDb(): Db {
  const url =
    process.env.NEXT_PHASE === "phase-production-build"
      ? "pglite://memory"
      : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForDb.tekinsofDb ??= createDb(url).db;
  return globalForDb.tekinsofDb;
}
