import { and, eq, lt } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import { adForms, inboundEvents, integrationAccounts } from "../db/schema.ts";
import type { Mailer } from "../integrations/graph.ts";
import {
  fetchFormLeads,
  fetchPageForms,
  isExpiredTokenError,
  type MetaDeps,
  toExternalLead,
} from "../integrations/meta.ts";
import { decryptSecret } from "../integrations/secrets.ts";
import { markMetaTokenExpired } from "../integrations/token-alerts.ts";
import { ok, type Result } from "../result.ts";
import { ingestExternalLead } from "./external-leads.ts";

// Hourly safety net for Meta Lead Ads (cron `meta-leads-backfill`). Webhooks can be lost (Meta gives
// up after its retries, a Page loses its subscription), so every connected Page is asked for its
// forms and their leads of the last two hours; ingestion is idempotent per lead id, so leads the
// webhook already delivered are skipped. Listing the Page's forms doubles as the token health
// check: an expired token flips the account to `expirada` and mails Gerencia once, because only
// `conectada` accounts are visited on the next run.

export type BackfillDeps = {
  meta: MetaDeps;
  encryptionKey: Buffer;
  mailer: Mailer;
  systemSender: string;
  crmBaseUrl: string;
};

export type BackfillSummary = {
  pages: number;
  found: number;
  created: number;
  duplicates: number;
  rejected: number;
  expired: number;
  failed: number;
};

const WINDOW_MS = 2 * 60 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type Account = { id: string; externalAccountId: string; displayName: string; token: string };
type FormRow = { name: string; fieldMapping: unknown; isActive: boolean };

async function backfillAccount(
  db: DbOrTx,
  deps: BackfillDeps,
  account: Account,
  forms: Map<string, FormRow>,
  now: Date,
  summary: BackfillSummary,
): Promise<void> {
  const fail = async (error: { message: string; fields?: Record<string, string> }) => {
    if (isExpiredTokenError(error)) {
      await markMetaTokenExpired(db, deps, { ...account, accountType: "page" }, error.message);
      summary.expired++;
    } else {
      await db
        .update(integrationAccounts)
        .set({ lastError: error.message })
        .where(eq(integrationAccounts.id, account.id));
      summary.failed++;
    }
  };

  const pageForms = await fetchPageForms(deps.meta, account.externalAccountId, account.token);
  if (!pageForms.ok) return fail(pageForms.error);

  const since = new Date(now.getTime() - WINDOW_MS);
  let created = 0;
  for (const metaForm of pageForms.data) {
    const known = forms.get(metaForm.id);
    if (known && !known.isActive) continue;
    const leads = await fetchFormLeads(deps.meta, metaForm.id, since, account.token);
    if (!leads.ok) return fail(leads.error);
    for (const lead of leads.data) {
      summary.found++;
      const external = toExternalLead(lead, {
        externalFormId: metaForm.id,
        name: known?.name ?? metaForm.name,
        mapping: (known?.fieldMapping ?? {}) as Record<string, string>,
      });
      const ingested = await ingestExternalLead(db, external);
      if (!ingested.ok) summary.rejected++;
      else if (ingested.data.duplicate) summary.duplicates++;
      else created++;
    }
  }
  summary.created += created;
  await db
    .update(integrationAccounts)
    .set(created > 0 ? { lastError: null, lastOkAt: now } : { lastError: null })
    .where(eq(integrationAccounts.id, account.id));
}

export async function metaLeadsBackfill(
  db: DbOrTx,
  deps: BackfillDeps,
  now: Date,
): Promise<Result<BackfillSummary>> {
  const summary: BackfillSummary = {
    pages: 0,
    found: 0,
    created: 0,
    duplicates: 0,
    rejected: 0,
    expired: 0,
    failed: 0,
  };
  const accounts = await db
    .select({
      id: integrationAccounts.id,
      externalAccountId: integrationAccounts.externalAccountId,
      displayName: integrationAccounts.displayName,
      credentialsEncrypted: integrationAccounts.credentialsEncrypted,
    })
    .from(integrationAccounts)
    .where(
      and(
        eq(integrationAccounts.provider, "meta"),
        eq(integrationAccounts.accountType, "page"),
        eq(integrationAccounts.status, "conectada"),
      ),
    );
  const formRows = await db
    .select({
      externalFormId: adForms.externalFormId,
      name: adForms.name,
      fieldMapping: adForms.fieldMapping,
      isActive: adForms.isActive,
    })
    .from(adForms)
    .where(eq(adForms.provider, "meta"));
  const forms = new Map(formRows.map((row) => [row.externalFormId, row]));

  for (const row of accounts) {
    summary.pages++;
    const token = decryptSecret(row.credentialsEncrypted, deps.encryptionKey);
    if (!token.ok) {
      await db
        .update(integrationAccounts)
        .set({ lastError: token.error.message })
        .where(eq(integrationAccounts.id, row.id));
      summary.failed++;
      continue;
    }
    await backfillAccount(db, deps, { ...row, token: token.data }, forms, now, summary);
  }
  return ok(summary);
}

// Webhook bodies carry personal data: kept 90 days for troubleshooting, then deleted (cron
// `inbound-purge`). Leads created from them are untouched.
export async function purgeInboundEvents(
  db: DbOrTx,
  now: Date,
): Promise<Result<{ deleted: number }>> {
  const deleted = await db
    .delete(inboundEvents)
    .where(lt(inboundEvents.receivedAt, new Date(now.getTime() - RETENTION_MS)))
    .returning({ id: inboundEvents.id });
  return ok({ deleted: deleted.length });
}
