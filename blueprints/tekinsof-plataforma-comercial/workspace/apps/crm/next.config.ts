import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// One .env at the repository root serves every package. Next only reads apps/crm/.env on its own,
// so load the root file here. Variables already set in the environment (CI, Playwright) win.
const rootEnv = join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  transpilePackages: ["@tekinsof/core"],
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
