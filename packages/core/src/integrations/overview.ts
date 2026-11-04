import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { InboundProvider } from "../capture/inbound.ts";
import type { DbOrTx } from "../db/client.ts";
import { adForms, auditEvents, inboundEvents, leads, opportunities, users } from "../db/schema.ts";
import { LIMA_OFFSET_MS, limaDate } from "../time/business-hours.ts";
import { type AccountRow, listAccounts } from "./accounts.ts";
import { type ActiveIntegration, type AdPlatform, activeIntegrations } from "./catalog.ts";

// Status and metrics for every active integration, derived from the rows the pipeline already
// writes (no status column of its own): accounts, ad forms, inbound events and leads.

export type DisplayStatus = "conectado" | "desconectado" | "error" | "pendiente";

export type IntegrationMetrics = {
  total: number;
  today: number;
  month: number;
  errors: number;
  /** This month's leads that already have an opportunity. */
  converted: number;
  /** Share of this month's leads that already have an opportunity; null without leads. */
  conversion: number | null;
};

export type IntegrationOverview = {
  integration: ActiveIntegration;
  status: DisplayStatus;
  statusDetail: string | null;
  accountName: string | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  responsible: string | null;
  metrics: IntegrationMetrics;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const sources = ["meta_lead_ads", "tiktok_lead_ads", "google_lead_form"];

// Midnight in Lima of today and of the first day of this month, as UTC instants.
export function limaPeriodStarts(now: Date): { today: Date; month: Date } {
  const [y, m, d] = limaDate(now).split("-").map(Number) as [number, number, number];
  return {
    today: new Date(Date.UTC(y, m - 1, d) - LIMA_OFFSET_MS),
    month: new Date(Date.UTC(y, m - 1, 1) - LIMA_OFFSET_MS),
  };
}

const toDate = (value: string | Date | null) => (value ? new Date(value) : null);
const latest = (...dates: Array<Date | null>) =>
  dates.reduce<Date | null>((max, date) => (date && (!max || date > max) ? date : max), null);

type LeadStats = {
  total: number;
  received: number;
  today: number;
  month: number;
  converted: number;
  lastLead: Date | null;
};
type EventStats = {
  errors: number;
  recent: number;
  recentErrors: number;
  lastProcessed: Date | null;
};

async function leadStats(db: DbOrTx, organizationId: string, now: Date) {
  const { today, month } = limaPeriodStarts(now);
  const real = sql`not ${leads.isTest}`;
  const hasOpportunity = sql`exists (select 1 from ${opportunities} where ${opportunities.leadId} = ${leads.id})`;
  const rows = await db
    .select({
      platform: leads.adPlatform,
      total: sql<number>`count(*) filter (where ${real})::int`,
      received: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${real} and ${leads.createdAt} >= ${today.toISOString()}::timestamptz)::int`,
      month: sql<number>`count(*) filter (where ${real} and ${leads.createdAt} >= ${month.toISOString()}::timestamptz)::int`,
      converted: sql<number>`count(*) filter (where ${real} and ${leads.createdAt} >= ${month.toISOString()}::timestamptz and ${hasOpportunity})::int`,
      lastLead: sql<string | null>`max(${leads.createdAt})`,
    })
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), inArray(leads.source, sources)))
    .groupBy(leads.adPlatform);
  const byPlatform = new Map<string, LeadStats>();
  for (const row of rows) {
    if (!row.platform) continue;
    byPlatform.set(row.platform, {
      total: Number(row.total),
      received: Number(row.received),
      today: Number(row.today),
      month: Number(row.month),
      converted: Number(row.converted),
      lastLead: toDate(row.lastLead),
    });
  }
  return byPlatform;
}

async function eventStats(db: DbOrTx, organizationId: string, now: Date) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const since24 = new Date(now.getTime() - DAY_MS).toISOString();
  const isError = sql`${inboundEvents.status} = 'error'`;
  const rows = await db
    .select({
      provider: inboundEvents.provider,
      errors: sql<number>`count(*) filter (where ${isError} and ${inboundEvents.receivedAt} >= ${since30}::timestamptz)::int`,
      recent: sql<number>`count(*) filter (where ${inboundEvents.receivedAt} >= ${since24}::timestamptz)::int`,
      recentErrors: sql<number>`count(*) filter (where ${isError} and ${inboundEvents.receivedAt} >= ${since24}::timestamptz)::int`,
      lastProcessed: sql<
        string | null
      >`max(${inboundEvents.processedAt}) filter (where ${inboundEvents.status} = 'procesado')`,
    })
    .from(inboundEvents)
    .where(eq(inboundEvents.organizationId, organizationId))
    .groupBy(inboundEvents.provider);
  const byProvider = new Map<string, EventStats>();
  for (const row of rows) {
    byProvider.set(row.provider, {
      errors: Number(row.errors),
      recent: Number(row.recent),
      recentErrors: Number(row.recentErrors),
      lastProcessed: toDate(row.lastProcessed),
    });
  }
  return byProvider;
}

async function googleSetup(db: DbOrTx, organizationId: string) {
  const [forms] = await db
    .select({
      active: sql<number>`count(*) filter (where ${adForms.isActive} and ${adForms.webhookKeyEncrypted} is not null)::int`,
      firstAt: sql<
        string | null
      >`min(${adForms.createdAt}) filter (where ${adForms.webhookKeyEncrypted} is not null)`,
    })
    .from(adForms)
    .where(and(eq(adForms.organizationId, organizationId), eq(adForms.provider, "google_ads")));
  const [creator] = await db
    .select({ name: users.name })
    .from(auditEvents)
    .innerJoin(users, eq(users.id, auditEvents.actorId))
    .where(eq(auditEvents.action, "integration.ad_form_created"))
    .orderBy(asc(auditEvents.occurredAt))
    .limit(1);
  return {
    activeForms: Number(forms?.active ?? 0),
    firstAt: toDate(forms?.firstAt ?? null),
    responsible: creator?.name ?? null,
  };
}

export type StatusInput = {
  configured: boolean;
  /** Set when the account itself is broken (expired or failing token). */
  accountProblem: string | null;
  received: number;
  recent: number;
  recentErrors: number;
};

export function deriveStatus(input: StatusInput): { status: DisplayStatus; detail: string | null } {
  if (input.accountProblem) return { status: "error", detail: input.accountProblem };
  if (!input.configured) return { status: "desconectado", detail: null };
  if (input.recent > 0 && input.recentErrors * 2 >= input.recent) {
    return { status: "error", detail: "La mitad o más de los eventos de las últimas 24 h falló" };
  }
  if (input.received === 0) return { status: "pendiente", detail: "Esperando el primer lead" };
  return { status: "conectado", detail: null };
}

function accountProblem(accounts: AccountRow[]): string | null {
  if (accounts.some((a) => a.status === "conectada")) return null;
  const broken = accounts.find((a) => a.status === "expirada" || a.status === "error");
  if (!broken) return null;
  return broken.status === "expirada" ? "Token vencido" : (broken.lastError ?? "Error de conexión");
}

const empty: LeadStats = {
  total: 0,
  received: 0,
  today: 0,
  month: 0,
  converted: 0,
  lastLead: null,
};
const noEvents: EventStats = { errors: 0, recent: 0, recentErrors: 0, lastProcessed: null };

export async function integrationOverview(
  db: DbOrTx,
  input: { organizationId: string; now: Date; tiktokSecretConfigured: boolean },
): Promise<IntegrationOverview[]> {
  const [byPlatform, byProvider, accounts, google] = await Promise.all([
    leadStats(db, input.organizationId, input.now),
    eventStats(db, input.organizationId, input.now),
    listAccounts(db, input.organizationId),
    googleSetup(db, input.organizationId),
  ]);
  // Ad accounts report spend, not leads: the Facebook and Instagram cards are about the Pages.
  const metaAccounts = accounts.filter(
    (a) => a.provider === "meta" && a.accountType === "page" && a.status !== "revocada",
  );
  const primary = metaAccounts.find((a) => a.status === "conectada") ?? metaAccounts[0] ?? null;

  return activeIntegrations.map((integration) => {
    const stats = byPlatform.get(integration.adPlatform as AdPlatform) ?? empty;
    const events = byProvider.get(integration.provider as InboundProvider) ?? noEvents;
    const setup = (() => {
      switch (integration.connection) {
        case "meta_page":
          return {
            configured: primary !== null,
            problem: accountProblem(metaAccounts),
            accountName:
              metaAccounts.length > 1
                ? `${primary?.displayName} y ${metaAccounts.length - 1} más`
                : (primary?.displayName ?? null),
            connectedAt: primary?.connectedAt ?? null,
            responsible: primary?.connectedByName ?? null,
            lastSync: latest(primary?.lastOkAt ?? null, events.lastProcessed),
          };
        case "google_form":
          return {
            configured: google.activeForms > 0,
            problem: null,
            accountName:
              google.activeForms > 0
                ? `${google.activeForms} formulario${google.activeForms === 1 ? "" : "s"}`
                : null,
            connectedAt: google.firstAt,
            responsible: google.responsible,
            lastSync: events.lastProcessed,
          };
        case "signed_webhook":
          return {
            configured: input.tiktokSecretConfigured,
            problem: null,
            accountName: input.tiktokSecretConfigured ? "Webhook firmado" : null,
            connectedAt: null,
            responsible: null,
            lastSync: events.lastProcessed,
          };
      }
    })();
    const { status, detail } = deriveStatus({
      configured: setup.configured,
      accountProblem: setup.problem,
      received: stats.received,
      recent: events.recent,
      recentErrors: events.recentErrors,
    });
    return {
      integration,
      status,
      statusDetail: detail,
      accountName: setup.accountName,
      connectedAt: setup.connectedAt,
      lastSyncAt: setup.lastSync ?? stats.lastLead,
      responsible: setup.responsible,
      metrics: {
        total: stats.total,
        today: stats.today,
        month: stats.month,
        errors: events.errors,
        converted: stats.converted,
        conversion: stats.month > 0 ? stats.converted / stats.month : null,
      },
    };
  });
}

// Facebook and Instagram share Meta's inbound events, so errors are counted once per provider.
export function overviewTotals(items: IntegrationOverview[]): IntegrationMetrics {
  const errorsByProvider = new Map(items.map((i) => [i.integration.provider, i.metrics.errors]));
  const month = items.reduce((sum, i) => sum + i.metrics.month, 0);
  const converted = items.reduce((sum, i) => sum + i.metrics.converted, 0);
  return {
    total: items.reduce((sum, i) => sum + i.metrics.total, 0),
    today: items.reduce((sum, i) => sum + i.metrics.today, 0),
    month,
    errors: [...errorsByProvider.values()].reduce((sum, n) => sum + n, 0),
    converted,
    conversion: month > 0 ? converted / month : null,
  };
}
