import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// One .env at the repository root serves every package; variables already exported win.
// Pages read process.env at build time (the site is fully static) and pass PUBLIC_* values to
// islands as props.
const rootEnv = join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// A relative `pglite://<dir>` means "from the repository root", but once core is bundled into the
// prerender chunks it can no longer find that root from its own location; hand it an absolute path.
const pglite = "pglite://";
const dbUrl = process.env.DATABASE_URL ?? "";
if (
  dbUrl.startsWith(pglite) &&
  dbUrl !== `${pglite}memory` &&
  !isAbsolute(dbUrl.slice(pglite.length))
) {
  process.env.DATABASE_URL = pglite + resolve(process.cwd(), "../..", dbUrl.slice(pglite.length));
}

const dbDrivers = ["@electric-sql/pglite", "postgres"];

export default defineConfig({
  site: "https://tekinsof.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react(), sitemap({ filter: (page) => !page.includes("/lp/") })],
  vite: {
    plugins: [tailwindcss()],
    // The build reads the database through @tekinsof/core; keep native/WASM drivers out of the bundle.
    // Static pages render in Astro's own `prerender` environment, which `ssr` does not configure.
    ssr: { external: dbDrivers },
    environments: { prerender: { resolve: { external: dbDrivers } } },
  },
});
