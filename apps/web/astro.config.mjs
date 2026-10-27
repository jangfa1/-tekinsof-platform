import { existsSync } from "node:fs";
import { join } from "node:path";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// One .env at the repository root serves every package; variables already exported win.
// Pages read process.env at build time (the site is fully static) and pass PUBLIC_* values to
// islands as props.
const rootEnv = join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  site: "https://tekinsof.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react(), sitemap({ filter: (page) => !page.includes("/lp/") })],
  vite: {
    plugins: [tailwindcss()],
    // The build reads the database through @tekinsof/core; keep native/WASM drivers out of the bundle.
    ssr: { external: ["@electric-sql/pglite", "postgres"] },
  },
});
