import { z } from "zod";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { businessMsBetween, limaDate } from "../time/business-hours.ts";
import {
  type CohortLead,
  cohortLeads,
  type DashboardFilters,
  dashboardSettings,
  ORGANIC,
  periodSpend,
  type SpendRow,
} from "./dashboard-data.ts";
import {
  Groups,
  type Highlights,
  highlights,
  PAID_PLATFORMS,
  periodKeys,
  type Row,
  type Stages,
} from "./dashboard-groups.ts";
import { type Counts, emptyCounts, type Metrics, median, toPen, withMetrics } from "./metrics.ts";

export { PAID_PLATFORMS };

// Marketing dashboard (blueprint R2, step r2-11). Cohort view: leads created in the period, and
// what became of them within 90 days (opportunity, proposal, won deal) even if that happened after
// the period ends. Spend is the spend of the period's days. Last-touch attribution: the lead's
// own campaign and platform. All money in PEN céntimos (USD at `exchange_rate_default`).

const DAY_MS = 24 * 60 * 60 * 1000;
export const ATTRIBUTION_WINDOW_DAYS = 90;

const day = z.iso.date("Fecha inválida");
const dashboardInput = z
  .object({
    from: day,
    to: day,
    campaignId: z.uuid().optional(),
    source: z.string().trim().min(1).max(40).optional(),
    platform: z.enum([...PAID_PLATFORMS, ORGANIC]).optional(),
    ownerId: z.string().trim().min(1).max(100).optional(),
    landingSlug: z.string().trim().min(1).max(80).optional(),
    grade: z.enum(["A", "B", "C", "D"]).optional(),
  })
  .refine((f) => f.from <= f.to, { message: "La fecha inicial va antes de la final", path: ["to"] })
  .refine((f) => Date.parse(f.to) - Date.parse(f.from) <= 366 * DAY_MS, {
    message: "El rango máximo es de un año",
    path: ["from"],
  });

export type FunnelStage = {
  key: keyof Pick<
    Counts,
    "leads" | "contacted" | "qualified" | "opportunities" | "proposals" | "won"
  >;
  label: string;
  count: number;
  /** Over the previous stage; null for the first one or when the previous one is empty. */
  fromPreviousBp: number | null;
};

export type MarketingDashboard = {
  filters: DashboardFilters;
  /** False when a lead-only filter (source, seller, landing, grade) makes spend meaningless. */
  spendComparable: boolean;
  totals: Metrics;
  byPlatform: Row[];
  byCampaign: Row[];
  byLanding: Row[];
  byOwner: Row[];
  byPeriod: Row[];
  periodUnit: "day" | "month";
  funnel: FunnelStage[];
  medianFirstContactHours: number | null;
  unmappedSpendCents: number | null;
  spendAsOf: string | null;
  highlights: Highlights;
};

const platformLabels: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  tiktok: "TikTok",
  otra: "Otras ubicaciones de Meta",
  [ORGANIC]: "Orgánico y directo",
};

// Cumulative stages: a lead at a later stage also counts in every earlier one, so the funnel
// never grows downwards. A grade A lead nobody contacted yet is not "calificado" here.
function stagesOf(lead: CohortLead, rate: number): Stages {
  const limit = lead.createdAt.getTime() + ATTRIBUTION_WINDOW_DAYS * DAY_MS;
  const opportunity =
    lead.opportunityId !== null && (lead.opportunityCreatedAt?.getTime() ?? 0) <= limit;
  const won =
    opportunity && lead.stage === "ganada" && (lead.wonAt?.getTime() ?? Infinity) <= limit;
  const proposal = opportunity && (Boolean(lead.proposalSent) || won);
  const contacted = opportunity || lead.firstContactedAt !== null;
  const qualified =
    opportunity ||
    (contacted &&
      (lead.status === "calificado" ||
        lead.status === "convertido" ||
        lead.grade === "A" ||
        lead.grade === "B"));
  return {
    contacted: Number(contacted),
    qualified: Number(qualified),
    opportunities: Number(opportunity),
    proposals: Number(proposal),
    won: Number(won),
    wonAmountCents: won ? toPen(lead.amountCents ?? 0, lead.currency ?? "PEN", rate) : 0,
  };
}

export async function getMarketingDashboard(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof dashboardInput>,
): Promise<Result<MarketingDashboard>> {
  if (!can(actor, "dashboard.marketing")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = dashboardInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const filters = parsed.data;
  const spendComparable = !(
    filters.source ||
    filters.ownerId ||
    filters.landingSlug ||
    filters.grade
  );

  const [leadRows, spendRows, settings] = await Promise.all([
    cohortLeads(db, filters),
    spendComparable ? periodSpend(db, filters) : Promise.resolve([] as SpendRow[]),
    dashboardSettings(db),
  ]);
  const { rate } = settings;
  const { unit, keys } = periodKeys(filters.from, filters.to);
  const periodOf = (limaDay: string) => (unit === "day" ? limaDay : limaDay.slice(0, 7));

  const totals = new Groups(spendComparable);
  const byPlatform = new Groups(spendComparable);
  const byCampaign = new Groups(spendComparable);
  const byLanding = new Groups(false);
  const byOwner = new Groups(false);
  const byPeriod = new Groups(spendComparable);
  // The four paid platforms and every period are listed even when empty.
  for (const key of PAID_PLATFORMS) byPlatform.get(key, platformLabels[key] ?? key);
  for (const key of keys) byPeriod.get(key, key);

  const contactHours: number[] = [];
  for (const lead of leadRows) {
    const stages = stagesOf(lead, rate);
    const platform = lead.adPlatform ?? ORGANIC;
    totals.addLead("total", "Total", stages);
    byPlatform.addLead(platform, platformLabels[platform] ?? platform, stages);
    byCampaign.addLead(
      lead.campaignId ?? "sin_campana",
      lead.campaignName ?? "Sin campaña",
      stages,
    );
    byLanding.addLead(lead.landingSlug ?? "sin_landing", lead.landingSlug ?? "Sin landing", stages);
    byOwner.addLead(lead.ownerId ?? "sin_asignar", lead.ownerName ?? "Sin asignar", stages);
    byPeriod.addLead(periodOf(limaDate(lead.createdAt)), "", stages);
    if (lead.firstContactedAt) {
      const ms = businessMsBetween(lead.createdAt, lead.firstContactedAt, settings.holidays);
      contactHours.push(ms / (60 * 60 * 1000));
    }
  }

  let unmapped = 0;
  for (const row of spendRows) {
    const cents = toPen(row.spendCents, row.currency, rate);
    totals.addSpend("total", "Total", cents);
    byPlatform.addSpend(row.adPlatform, platformLabels[row.adPlatform] ?? row.adPlatform, cents);
    byPeriod.addSpend(periodOf(row.date), "", cents);
    if (row.campaignId) byCampaign.addSpend(row.campaignId, row.campaignName ?? "", cents);
    else unmapped += cents;
  }

  const [total] = totals.list();
  const totalMetrics = total?.metrics ?? withMetrics(emptyCounts(spendComparable ? 0 : null));
  const stageLabels: [FunnelStage["key"], string][] = [
    ["leads", "Leads"],
    ["contacted", "Contactados"],
    ["qualified", "Calificados"],
    ["opportunities", "Oportunidades"],
    ["proposals", "Propuestas"],
    ["won", "Ganadas"],
  ];
  const funnel = stageLabels.map(([key, label], index) => {
    const previous = index > 0 ? totalMetrics[stageLabels[index - 1]?.[0] ?? "leads"] : 0;
    const count = totalMetrics[key];
    return {
      key,
      label,
      count,
      fromPreviousBp: index === 0 || previous === 0 ? null : Math.round((count * 10000) / previous),
    };
  });
  const hours = median(contactHours);
  const platformRows = byPlatform.list([...PAID_PLATFORMS, ORGANIC, "otra"]);
  const campaignRows = byCampaign.list();

  return ok({
    filters,
    spendComparable,
    totals: totalMetrics,
    byPlatform: platformRows,
    byCampaign: campaignRows,
    byLanding: byLanding.list(),
    byOwner: byOwner.list(),
    byPeriod: byPeriod.list(keys).map((row) => ({ ...row, label: row.key })),
    periodUnit: unit,
    funnel,
    medianFirstContactHours: hours === null ? null : Math.round(hours * 10) / 10,
    unmappedSpendCents: spendComparable ? unmapped : null,
    spendAsOf: settings.spendAsOf,
    highlights: highlights(platformRows, campaignRows),
  });
}
