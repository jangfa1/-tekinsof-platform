import { and, eq, gte, isNotNull, isNull, lt, lte, max, type SQL, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import {
  appSettings,
  campaignSpendDaily,
  campaigns,
  holidays,
  leads,
  opportunities,
  quotes,
  users,
} from "../db/schema.ts";
import { LIMA_OFFSET_MS } from "../time/business-hours.ts";
import { parseRate } from "./metrics.ts";

// Reads for the marketing dashboard: one row per lead of the period (with its opportunity and
// whether a quote was sent), the spend rows of the period, and the settings the math needs. The
// aggregation happens in dashboard.ts; at Tekinsof's volume (hundreds of leads a month) one pass
// in memory is simpler and as fast as one GROUP BY per breakdown.

export const ORGANIC = "organico";

export type DashboardFilters = {
  from: string;
  to: string;
  campaignId?: string;
  source?: string;
  /** An ad platform, or `organico` for leads without one. */
  platform?: string;
  ownerId?: string;
  landingSlug?: string;
  grade?: string;
};

// First instant of a Lima calendar day, as UTC.
export const limaDayStart = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - LIMA_OFFSET_MS);
const DAY_MS = 24 * 60 * 60 * 1000;

export function cohortLeads(db: DbOrTx, filters: DashboardFilters) {
  const conditions: (SQL | undefined)[] = [
    eq(leads.isTest, false),
    isNull(leads.deletedAt),
    gte(leads.createdAt, limaDayStart(filters.from)),
    lt(leads.createdAt, new Date(limaDayStart(filters.to).getTime() + DAY_MS)),
    filters.campaignId ? eq(leads.campaignId, filters.campaignId) : undefined,
    filters.source ? eq(leads.source, filters.source) : undefined,
    filters.platform === ORGANIC
      ? isNull(leads.adPlatform)
      : filters.platform
        ? eq(leads.adPlatform, filters.platform)
        : undefined,
    filters.ownerId ? eq(leads.ownerId, filters.ownerId) : undefined,
    filters.landingSlug ? eq(leads.landingSlug, filters.landingSlug) : undefined,
    filters.grade ? eq(leads.grade, filters.grade) : undefined,
  ];
  return db
    .select({
      id: leads.id,
      createdAt: leads.createdAt,
      source: leads.source,
      adPlatform: leads.adPlatform,
      campaignId: leads.campaignId,
      campaignName: campaigns.name,
      landingSlug: leads.landingSlug,
      ownerId: leads.ownerId,
      ownerName: users.name,
      status: leads.status,
      grade: leads.grade,
      firstContactedAt: leads.firstContactedAt,
      opportunityId: opportunities.id,
      opportunityCreatedAt: opportunities.createdAt,
      stage: opportunities.stage,
      amountCents: opportunities.amountCents,
      currency: opportunities.currency,
      wonAt: opportunities.wonAt,
      proposalSent: sql<boolean>`exists (select 1 from ${quotes} where ${quotes.opportunityId} = ${opportunities.id} and ${quotes.sentAt} is not null)`,
    })
    .from(leads)
    .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .leftJoin(
      opportunities,
      and(eq(opportunities.leadId, leads.id), isNull(opportunities.deletedAt)),
    )
    .where(and(...conditions));
}

export type CohortLead = Awaited<ReturnType<typeof cohortLeads>>[number];

// Spend follows the date, campaign and platform filters; the others have no spend of their own.
export function periodSpend(db: DbOrTx, filters: DashboardFilters) {
  const platform =
    filters.platform === ORGANIC
      ? sql`false`
      : filters.platform
        ? eq(campaignSpendDaily.adPlatform, filters.platform)
        : undefined;
  return db
    .select({
      campaignId: campaignSpendDaily.campaignId,
      campaignName: campaigns.name,
      adPlatform: campaignSpendDaily.adPlatform,
      date: campaignSpendDaily.date,
      spendCents: campaignSpendDaily.spendCents,
      currency: campaignSpendDaily.currency,
    })
    .from(campaignSpendDaily)
    .leftJoin(campaigns, eq(campaigns.id, campaignSpendDaily.campaignId))
    .where(
      and(
        gte(campaignSpendDaily.date, filters.from),
        lte(campaignSpendDaily.date, filters.to),
        filters.campaignId ? eq(campaignSpendDaily.campaignId, filters.campaignId) : undefined,
        platform,
      ),
    );
}

export type SpendRow = Awaited<ReturnType<typeof periodSpend>>[number];

export async function dashboardSettings(db: DbOrTx) {
  const [rate, holidayRows, latest] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.key, "exchange_rate_default")),
    db.select({ date: holidays.date }).from(holidays),
    db
      .select({ date: max(campaignSpendDaily.date) })
      .from(campaignSpendDaily)
      .where(isNotNull(campaignSpendDaily.spendCents)),
  ]);
  const usdToPen = (rate[0]?.value as { usdToPen?: string } | undefined)?.usdToPen;
  return {
    rate: parseRate(usdToPen),
    holidays: new Set(holidayRows.map((row) => row.date)),
    spendAsOf: latest[0]?.date ?? null,
  };
}
