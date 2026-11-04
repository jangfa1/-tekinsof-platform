import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import { campaignSpendDaily, campaigns, integrationAccounts } from "../db/schema.ts";
import { isExpiredTokenError, type MetaDeps } from "../integrations/meta.ts";
import {
  fetchAdAccount,
  fetchCampaignInsights,
  insightLeads,
  type MetaInsight,
} from "../integrations/meta-ads.ts";
import { decryptSecret } from "../integrations/secrets.ts";
import { markMetaTokenExpired, type TokenAlertDeps } from "../integrations/token-alerts.ts";
import { ok, type Result } from "../result.ts";
import { limaDate } from "../time/business-hours.ts";
import { decimalToCents, type SpendPlatform, spendCurrencies } from "./spend.ts";

// Cron `spend-sync` (06:00 Lima): the last 3 days of every connected Meta ad account, because
// Meta keeps adjusting recent spend. Each (campaign, platform, day) row is updated in place, so
// repeating days never duplicates. Spend of a Meta campaign no CRM campaign claims is stored
// unmapped and attached when Marketing maps it.

export type SpendSyncDeps = TokenAlertDeps & { meta: MetaDeps; encryptionKey: Buffer };

export type SpendSyncSummary = {
  accounts: number;
  rows: number;
  unmapped: number;
  expired: number;
  failed: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const SPEND_SYNC_DAYS = 3;

const platformOf = (publisher?: string): SpendPlatform =>
  publisher === "facebook" || publisher === "instagram" ? publisher : "otra";

type Row = {
  externalCampaignId: string;
  name: string | undefined;
  adPlatform: SpendPlatform;
  date: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number | null;
};

// Audience Network, Messenger and Threads all fold into "otra", so rows are summed per key.
function aggregate(insights: MetaInsight[]): Row[] {
  const rows = new Map<string, Row>();
  for (const insight of insights) {
    const adPlatform = platformOf(insight.publisher_platform);
    const key = `${insight.campaign_id}|${adPlatform}|${insight.date_start}`;
    const row = rows.get(key) ?? {
      externalCampaignId: insight.campaign_id,
      name: insight.campaign_name,
      adPlatform,
      date: insight.date_start,
      spendCents: 0,
      impressions: 0,
      clicks: 0,
      leads: null,
    };
    row.spendCents += decimalToCents(insight.spend) ?? 0;
    row.impressions += insight.impressions ?? 0;
    row.clicks += insight.clicks ?? 0;
    const leads = insightLeads(insight);
    if (leads !== null) row.leads = (row.leads ?? 0) + leads;
    rows.set(key, row);
  }
  return [...rows.values()];
}

async function metaCampaignMap(db: DbOrTx): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: campaigns.id, externalRefs: campaigns.externalRefs })
    .from(campaigns);
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const id of ((row.externalRefs ?? {}) as Record<string, string[]>).meta ?? []) {
      map.set(id, row.id);
    }
  }
  return map;
}

export async function syncMetaSpend(
  db: DbOrTx,
  deps: SpendSyncDeps,
  now: Date,
): Promise<Result<SpendSyncSummary>> {
  const summary: SpendSyncSummary = { accounts: 0, rows: 0, unmapped: 0, expired: 0, failed: 0 };
  const range = {
    since: limaDate(new Date(now.getTime() - SPEND_SYNC_DAYS * DAY_MS)),
    until: limaDate(new Date(now.getTime() - DAY_MS)),
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
        eq(integrationAccounts.accountType, "ad_account"),
        eq(integrationAccounts.status, "conectada"),
      ),
    );
  const mapped = await metaCampaignMap(db);

  for (const account of accounts) {
    summary.accounts++;
    const setError = async (message: string) => {
      await db
        .update(integrationAccounts)
        .set({ lastError: message })
        .where(eq(integrationAccounts.id, account.id));
      summary.failed++;
    };
    const fail = async (error: { message: string; fields?: Record<string, string> }) => {
      if (!isExpiredTokenError(error)) return setError(error.message);
      await markMetaTokenExpired(
        db,
        deps,
        { ...account, accountType: "ad_account" },
        error.message,
      );
      summary.expired++;
    };

    const token = decryptSecret(account.credentialsEncrypted, deps.encryptionKey);
    if (!token.ok) {
      await setError(token.error.message);
      continue;
    }
    const settings = await fetchAdAccount(deps.meta, account.externalAccountId, token.data);
    if (!settings.ok) {
      await fail(settings.error);
      continue;
    }
    const currency = settings.data.currency.toUpperCase();
    if (!(spendCurrencies as readonly string[]).includes(currency)) {
      await setError(`La cuenta publicitaria usa ${currency}; el CRM solo admite PEN o USD`);
      continue;
    }
    const insights = await fetchCampaignInsights(
      deps.meta,
      account.externalAccountId,
      token.data,
      range,
    );
    if (!insights.ok) {
      await fail(insights.error);
      continue;
    }

    const unmapped = new Set<string>();
    for (const row of aggregate(insights.data)) {
      const campaignId = mapped.get(row.externalCampaignId) ?? null;
      if (!campaignId) unmapped.add(row.externalCampaignId);
      const values = {
        campaignId,
        externalCampaignName: row.name ?? null,
        spendCents: row.spendCents,
        currency,
        impressions: row.impressions,
        clicks: row.clicks,
        platformLeads: row.leads,
      };
      await db
        .insert(campaignSpendDaily)
        .values({
          ...values,
          provider: "meta",
          adPlatform: row.adPlatform,
          externalCampaignId: row.externalCampaignId,
          date: row.date,
        })
        .onConflictDoUpdate({
          target: [
            campaignSpendDaily.provider,
            campaignSpendDaily.externalCampaignId,
            campaignSpendDaily.adPlatform,
            campaignSpendDaily.date,
          ],
          targetWhere: sql`${campaignSpendDaily.externalCampaignId} is not null`,
          set: { ...values, updatedAt: sql`now()` },
        });
      summary.rows++;
    }
    summary.unmapped += unmapped.size;
    await db
      .update(integrationAccounts)
      .set({ lastError: null, lastOkAt: now })
      .where(eq(integrationAccounts.id, account.id));
  }
  return ok(summary);
}
