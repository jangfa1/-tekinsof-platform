import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { integrationAccounts, users } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { encryptSecret } from "./secrets.ts";

// Ad platform accounts managed from /configuracion/integraciones (blueprint R2, step r2-07).
// Every function takes the organization explicitly: today the CRM always passes the default one,
// and the SaaS phase only has to resolve it from the session. Tokens are sealed before they reach
// the database and no read ever returns them.

export type IntegrationDeps = { organizationId: string; encryptionKey: Buffer };

const connectMetaInput = z.object({
  pageId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, "El ID de la Página solo tiene números"),
  displayName: z.string().trim().min(1, "Escribe el nombre de la Página").max(120),
  pageToken: z
    .string()
    .trim()
    .min(20, "El token parece incompleto")
    .max(1000)
    .regex(/^\S+$/, "El token no lleva espacios"),
});

export async function connectMetaPage(
  db: DbOrTx,
  actor: Actor,
  deps: IntegrationDeps,
  input: z.input<typeof connectMetaInput>,
): Promise<Result<{ accountId: string }>> {
  if (!can(actor, "integrations.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = connectMetaInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { pageId, displayName, pageToken } = parsed.data;
  return saveMetaAccount(db, actor, deps, {
    accountType: "page",
    externalAccountId: pageId,
    displayName,
    token: pageToken,
  });
}

const connectAdAccountInput = z.object({
  adAccountId: z
    .string()
    .trim()
    .transform((value) => value.replace(/^act_/i, ""))
    .pipe(z.string().regex(/^\d{5,30}$/, "El ID de la cuenta publicitaria solo tiene números")),
  displayName: z.string().trim().min(1, "Escribe el nombre de la cuenta").max(120),
  token: connectMetaInput.shape.pageToken,
});

// The ad account (`act_…`) whose spend the `spend-sync` cron reads; its token needs `ads_read`.
export async function connectMetaAdAccount(
  db: DbOrTx,
  actor: Actor,
  deps: IntegrationDeps,
  input: z.input<typeof connectAdAccountInput>,
): Promise<Result<{ accountId: string }>> {
  if (!can(actor, "integrations.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = connectAdAccountInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { adAccountId, displayName, token } = parsed.data;
  return saveMetaAccount(db, actor, deps, {
    accountType: "ad_account",
    externalAccountId: adAccountId,
    displayName,
    token,
  });
}

async function saveMetaAccount(
  db: DbOrTx,
  actor: Actor,
  deps: IntegrationDeps,
  account: {
    accountType: "page" | "ad_account";
    externalAccountId: string;
    displayName: string;
    token: string;
  },
): Promise<Result<{ accountId: string }>> {
  const { accountType, externalAccountId, displayName } = account;
  const sealed = encryptSecret(account.token, deps.encryptionKey);

  return db.transaction(async (tx) => {
    // Reconnecting the same account (a new token, or after a disconnect) updates the row in place.
    const [row] = await tx
      .insert(integrationAccounts)
      .values({
        organizationId: deps.organizationId,
        provider: "meta",
        accountType,
        externalAccountId,
        displayName,
        credentialsEncrypted: sealed,
        connectedBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [
          integrationAccounts.organizationId,
          integrationAccounts.provider,
          integrationAccounts.externalAccountId,
        ],
        set: {
          accountType,
          displayName,
          credentialsEncrypted: sealed,
          status: "conectada",
          connectedBy: actor.id,
          lastError: null,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: integrationAccounts.id });
    if (!row) return err("INTERNAL", "No se pudo guardar la cuenta");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "integration.connected",
      targetType: "integration_account",
      targetId: row.id,
      metadata: { provider: "meta", accountType, externalAccountId, displayName },
    });
    return ok({ accountId: row.id });
  });
}

const disconnectInput = z.object({ accountId: z.uuid("Cuenta inválida") });

// The row stays (leads and forms keep pointing at it); the sealed token is wiped.
export async function disconnectAccount(
  db: DbOrTx,
  actor: Actor,
  deps: Pick<IntegrationDeps, "organizationId">,
  input: z.input<typeof disconnectInput>,
): Promise<Result<{ accountId: string }>> {
  if (!can(actor, "integrations.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = disconnectInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { accountId } = parsed.data;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(integrationAccounts)
      .set({ status: "revocada", credentialsEncrypted: "", updatedAt: sql`now()` })
      .where(
        and(
          eq(integrationAccounts.id, accountId),
          eq(integrationAccounts.organizationId, deps.organizationId),
        ),
      )
      .returning({
        id: integrationAccounts.id,
        provider: integrationAccounts.provider,
        externalAccountId: integrationAccounts.externalAccountId,
      });
    if (!row) return err("NOT_FOUND", "Cuenta no encontrada");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "integration.disconnected",
      targetType: "integration_account",
      targetId: row.id,
      metadata: { provider: row.provider, externalAccountId: row.externalAccountId },
    });
    return ok({ accountId: row.id });
  });
}

export type AccountRow = {
  id: string;
  provider: string;
  accountType: string;
  externalAccountId: string;
  displayName: string;
  status: string;
  connectedAt: Date;
  connectedByName: string | null;
  lastOkAt: Date | null;
  lastError: string | null;
  tokenExpiresAt: Date | null;
};

export function listAccounts(db: DbOrTx, organizationId: string): Promise<AccountRow[]> {
  return db
    .select({
      id: integrationAccounts.id,
      provider: integrationAccounts.provider,
      accountType: integrationAccounts.accountType,
      externalAccountId: integrationAccounts.externalAccountId,
      displayName: integrationAccounts.displayName,
      status: integrationAccounts.status,
      connectedAt: integrationAccounts.createdAt,
      connectedByName: users.name,
      lastOkAt: integrationAccounts.lastOkAt,
      lastError: integrationAccounts.lastError,
      tokenExpiresAt: integrationAccounts.tokenExpiresAt,
    })
    .from(integrationAccounts)
    .leftJoin(users, eq(users.id, integrationAccounts.connectedBy))
    .where(eq(integrationAccounts.organizationId, organizationId))
    .orderBy(desc(integrationAccounts.updatedAt));
}
