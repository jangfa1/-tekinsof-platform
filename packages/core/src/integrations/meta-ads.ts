import { z } from "zod";
import { err, ok, type Result } from "../result.ts";
import { GRAPH_ORIGIN, graphGet, graphList, type MetaDeps } from "./meta.ts";

// Meta Marketing API, read only: the ad account's currency and daily spend per campaign split by
// publisher platform (Facebook, Instagram, Audience Network, Messenger). Needs a token with
// `ads_read` on the ad account. Days follow the ad account's time zone (set it to America/Lima).

const accountPath = (adAccountId: string) =>
  `act_${encodeURIComponent(adAccountId.replace(/^act_/, ""))}`;

const adAccountSchema = z.object({
  currency: z.string(),
  timezone_name: z.string().optional(),
  name: z.string().optional(),
});
export type MetaAdAccount = z.infer<typeof adAccountSchema>;

/** The ad account's settings; also proves the token still works. */
export async function fetchAdAccount(
  deps: MetaDeps,
  adAccountId: string,
  token: string,
): Promise<Result<MetaAdAccount>> {
  const url = `${GRAPH_ORIGIN}${deps.graphVersion}/${accountPath(adAccountId)}?fields=currency,timezone_name,name`;
  const body = await graphGet(deps, url, token);
  if (!body.ok) return body;
  const account = adAccountSchema.safeParse(body.data);
  if (!account.success) return err("INTERNAL", "Respuesta de Meta inesperada");
  return ok(account.data);
}

const insightSchema = z.object({
  campaign_id: z.coerce.string().min(1),
  campaign_name: z.string().optional(),
  publisher_platform: z.string().optional(),
  date_start: z.string(),
  spend: z.coerce.string().default("0"),
  impressions: z.coerce.number().int().optional(),
  clicks: z.coerce.number().int().optional(),
  actions: z.array(z.object({ action_type: z.string(), value: z.coerce.string() })).optional(),
});
export type MetaInsight = z.infer<typeof insightSchema>;

/** One row per campaign, publisher platform and day between `since` and `until` (YYYY-MM-DD). */
export function fetchCampaignInsights(
  deps: MetaDeps,
  adAccountId: string,
  token: string,
  range: { since: string; until: string },
): Promise<Result<MetaInsight[]>> {
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
    breakdowns: "publisher_platform",
    time_increment: "1",
    time_range: JSON.stringify(range),
    limit: "500",
  });
  const url = `${GRAPH_ORIGIN}${deps.graphVersion}/${accountPath(adAccountId)}/insights?${params}`;
  return graphList(deps, url, token, insightSchema);
}

/** Leads Meta attributes to the row (lead form submissions). */
export function insightLeads(insight: MetaInsight): number | null {
  const action = insight.actions?.find((a) => a.action_type === "lead");
  return action ? Number.parseInt(action.value, 10) || 0 : null;
}
