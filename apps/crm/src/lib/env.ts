import { z } from "zod";

// The only module in the CRM that reads process.env. Every variable is documented in blueprint §10.
const optional = z.string().trim().optional();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CRM_BOOTSTRAP_ADMIN_EMAIL: z.email(),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("tekinsof.com"),
  AUTH_TEST_MODE: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  VERCEL_ENV: optional,
  ENTRA_TENANT_ID: optional,
  ENTRA_CLIENT_ID: optional,
  ENTRA_CLIENT_SECRET: optional,
  SITE_ORIGIN: z.string().default("http://localhost:4321"),
  TURNSTILE_SECRET_KEY: z.string().default("1x0000000000000000000000000000000AA"),
  MAIL_DRIVER: z.enum(["graph", "log"]).default("log"),
  GRAPH_TENANT_ID: optional,
  GRAPH_CLIENT_ID: optional,
  GRAPH_CLIENT_SECRET: optional,
  GRAPH_SYSTEM_SENDER: optional,
  CRM_BASE_URL: z.string().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["supabase", "local"]).default("local"),
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  VERCEL_DEPLOY_HOOK_URL: optional,
  INNGEST_EVENT_KEY: optional,
  INNGEST_SIGNING_KEY: optional,
});

export type Env = z.infer<typeof schema>;

const requiredInProduction = [
  "ENTRA_TENANT_ID",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "GRAPH_TENANT_ID",
  "GRAPH_CLIENT_ID",
  "GRAPH_CLIENT_SECRET",
  "GRAPH_SYSTEM_SENDER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_DEPLOY_HOOK_URL",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
] as const;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Empty strings (as in .env.example) mean "not set", so defaults and optionals apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(cleaned);
  const messages: string[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

  // Production rules run in plain code so they are reported even when a base field failed.
  if (cleaned.VERCEL_ENV === "production") {
    if (cleaned.AUTH_TEST_MODE === "1") messages.push("AUTH_TEST_MODE no se permite en producción");
    for (const name of requiredInProduction) {
      if (!cleaned[name]?.trim()) messages.push(`${name} es obligatoria en producción`);
    }
    if (cleaned.MAIL_DRIVER !== "graph") messages.push("MAIL_DRIVER debe ser graph");
    if (cleaned.STORAGE_DRIVER !== "supabase") messages.push("STORAGE_DRIVER debe ser supabase");
    const turnstile = cleaned.TURNSTILE_SECRET_KEY ?? "1x";
    if (turnstile.startsWith("1x") || turnstile.startsWith("2x")) {
      messages.push("TURNSTILE_SECRET_KEY no puede ser una clave de prueba");
    }
  }

  if (messages.length > 0 || !parsed.success) {
    throw new Error(`Configuración inválida: ${messages.join("; ")}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
