import { getDb, schema } from "@tekinsof/core/db/client";
import { admitUser, markInvitationAccepted } from "@tekinsof/core/users/users";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "./env";

const env = getEnv();

const microsoft =
  env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.ENTRA_TENANT_ID
    ? {
        microsoft: {
          clientId: env.ENTRA_CLIENT_ID,
          clientSecret: env.ENTRA_CLIENT_SECRET,
          tenantId: env.ENTRA_TENANT_ID,
          prompt: "select_account" as const,
        },
      }
    : undefined;

export const auth = betterAuth({
  appName: "Tekinsof CRM",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  // E2E signs many users in within seconds; parseEnv forbids AUTH_TEST_MODE in production.
  rateLimit: { enabled: !env.AUTH_TEST_MODE },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "ventas", input: env.AUTH_TEST_MODE },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  emailAndPassword: { enabled: env.AUTH_TEST_MODE, autoSignIn: true },
  socialProviders: microsoft,
  onAPIError: { errorURL: "/login" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const decision = await admitUser(getDb(), {
            email: user.email,
            requestedRole: typeof user.role === "string" ? user.role : undefined,
            testMode: env.AUTH_TEST_MODE,
            bootstrapEmail: env.CRM_BOOTSTRAP_ADMIN_EMAIL,
            allowedDomain: env.ALLOWED_EMAIL_DOMAIN,
          });
          if (!decision.ok) return false;
          return { data: { ...user, email: user.email.toLowerCase(), role: decision.data.role } };
        },
        after: async (user) => {
          await markInvitationAccepted(getDb(), user.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
