// `astro dev` with its own database. PGlite locks its directory, and `pnpm dev` starts the CRM in
// parallel on the same DATABASE_URL, so when that URL is an on-disk PGlite the site gets a separate
// directory (SITE_DEV_DATABASE_URL, default `.data/web-dev`), migrated and seeded on every start.
// A postgres:// URL is shared safely and passes through untouched.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webDir, "../..");
const coreScripts = join(repoRoot, "packages/core/scripts");

const envFile = join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function run(script: string, env: NodeJS.ProcessEnv, args: string[] = []): void {
  const { status } = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env,
  });
  if (status !== 0) process.exit(status ?? 1);
}

const url = process.env.DATABASE_URL ?? "";
let env: NodeJS.ProcessEnv = process.env;
if (url.startsWith("pglite://") && url !== "pglite://memory") {
  const siteUrl = process.env.SITE_DEV_DATABASE_URL || "pglite://.data/web-dev";
  // Already-set variables win over .env in the child scripts; the empty DIRECT keeps migrate here.
  env = { ...process.env, DATABASE_URL: siteUrl, DATABASE_URL_DIRECT: "" };
  env.SEED_DEMO ??= "1";
  console.log(`site dev: own database ${siteUrl} (the CRM keeps ${url})`);
  run(join(coreScripts, "migrate.ts"), env);
  run(join(coreScripts, "seed.ts"), env);
}

run(join(webDir, "node_modules/astro/bin/astro.mjs"), env, ["dev", ...process.argv.slice(2)]);
