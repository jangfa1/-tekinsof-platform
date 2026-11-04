// One-off after deploying r2-11: creates the first touchpoint of every existing lead and fills the
// ad platform of site leads that came from an ad. Idempotent: leads that already have touchpoints
// are skipped, so running it twice changes nothing.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/db/client.ts";
import { backfillTouchpoints } from "../src/marketing/attribution.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "backfill: DATABASE_URL is not set (export it or add it to the repository-root .env)",
  );
  process.exit(1);
}

const { db, close } = createDb(url);
try {
  const result = await backfillTouchpoints(db);
  console.log(`backfill: ${result.touchpoints} touchpoints, ${result.platforms} platforms filled`);
} finally {
  await close();
}
