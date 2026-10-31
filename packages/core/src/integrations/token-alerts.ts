import { and, eq } from "drizzle-orm";
import { writeAudit } from "../audit/audit.ts";
import type { DbOrTx } from "../db/client.ts";
import { integrationAccounts, users } from "../db/schema.ts";
import { escapeHtml, type Mailer } from "./graph.ts";

// An expired Meta token flips its account from `conectada` to `expirada` and mails every active
// Gerencia user. Only `conectada` accounts are visited by the crons, so the alert goes out once
// until someone reconnects (used by the lead backfill and the spend sync).

export type TokenAlertDeps = { mailer: Mailer; systemSender: string; crmBaseUrl: string };

type ExpiredAccount = {
  id: string;
  displayName: string;
  externalAccountId: string;
  accountType: "page" | "ad_account";
};

const copy = {
  page: {
    what: "la Página",
    impact: "los leads de Facebook e Instagram de esa Página no llegarán al CRM",
    action: "Reconectar la Página",
  },
  ad_account: {
    what: "la cuenta publicitaria",
    impact: "el gasto de sus campañas no se actualizará en los reportes",
    action: "Reconectar la cuenta publicitaria",
  },
};

export async function markMetaTokenExpired(
  db: DbOrTx,
  deps: TokenAlertDeps,
  account: ExpiredAccount,
  message: string,
): Promise<void> {
  const flipped = await db.transaction(async (tx) => {
    const rows = await tx
      .update(integrationAccounts)
      .set({ status: "expirada", lastError: message })
      .where(
        and(eq(integrationAccounts.id, account.id), eq(integrationAccounts.status, "conectada")),
      )
      .returning({ id: integrationAccounts.id });
    if (rows.length === 0) return false;
    await writeAudit(tx, {
      actorId: null,
      action: "integration.token_expired",
      targetType: "integration_account",
      targetId: account.id,
      metadata:
        account.accountType === "page"
          ? { provider: "meta", pageId: account.externalAccountId }
          : { provider: "meta", adAccountId: account.externalAccountId },
    });
    return true;
  });
  // Another run already flipped it and sent the alert.
  if (!flipped) return;

  const text = copy[account.accountType];
  const managers = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "gerencia"), eq(users.isActive, true)));
  const link = `${deps.crmBaseUrl}/configuracion/integraciones/facebook`;
  const html = [
    `<p>El token de ${text.what} <strong>${escapeHtml(account.displayName)}</strong> venció o fue revocado.</p>`,
    `<p>Mientras no se reconecte, ${text.impact}.</p>`,
    `<p><a href="${escapeHtml(link)}">${text.action}</a> con un token nuevo del usuario del sistema.</p>`,
  ].join("");
  for (const { email } of managers) {
    await deps.mailer.send({
      from: deps.systemSender,
      to: [email],
      subject: `Token de Meta vencido: ${account.displayName}`,
      html,
    });
  }
}
