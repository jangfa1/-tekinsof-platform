import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ExternalLead } from "../capture/external-leads.ts";
import { err, ok, type Result } from "../result.ts";

// Meta Lead Ads (Facebook and Instagram share the Page `leadgen` subscription). The webhook only
// carries ids; the lead itself is read from the Graph API with the Page's token.

export type MetaDeps = { fetch: typeof fetch; graphVersion: string };

// `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body with the App Secret>`.
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const id = z.coerce.string().min(1);

export const leadgenValue = z.object({
  leadgen_id: id,
  page_id: id,
  form_id: id,
  ad_id: id.optional(),
  adgroup_id: id.optional(),
  created_time: z.coerce.number(),
});
export type LeadgenNotification = z.infer<typeof leadgenValue>;

const webhookBody = z.object({
  object: z.literal("page"),
  entry: z.array(
    z.object({ changes: z.array(z.object({ field: z.string(), value: z.unknown() })) }),
  ),
});

// Other Page fields (feed, mentions…) may share the subscription; only `leadgen` is kept.
export function parseLeadgenWebhook(body: unknown): Result<LeadgenNotification[]> {
  const parsed = webhookBody.safeParse(body);
  if (!parsed.success) return err("VALIDATION_ERROR", "Payload de Meta inválido");
  const notifications: LeadgenNotification[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      const value = leadgenValue.safeParse(change.value);
      if (!value.success) return err("VALIDATION_ERROR", "Notificación leadgen inválida");
      notifications.push(value.data);
    }
  }
  return ok(notifications);
}

const metaLeadSchema = z.object({
  id: id,
  created_time: z.string(),
  ad_id: id.optional(),
  adset_id: id.optional(),
  campaign_id: id.optional(),
  form_id: id.optional(),
  platform: z.string().optional(),
  field_data: z
    .array(z.object({ name: z.string(), values: z.array(z.coerce.string()).default([]) }))
    .default([]),
});
export type MetaLead = z.infer<typeof metaLeadSchema>;

const leadFields = "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,platform";

export const GRAPH_ORIGIN = "https://graph.facebook.com/";

// The token travels in the Authorization header so it never lands in URL logs. Errors carry
// `fields.graphCode` (Graph's error code, or the HTTP status when there is none).
export async function graphGet(
  deps: MetaDeps,
  url: string,
  token: string,
): Promise<Result<unknown>> {
  let body: unknown;
  let status: number;
  try {
    const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    status = res.status;
    body = await res.json();
  } catch (error) {
    return err("INTERNAL", `Meta no respondió: ${(error as Error).message}`);
  }
  if (status >= 400) {
    const graph = (body as { error?: { message?: string; code?: number } }).error;
    return err("INTERNAL", `Meta ${graph?.code ?? status}: ${graph?.message ?? "error"}`, {
      graphCode: String(graph?.code ?? status),
    });
  }
  return ok(body);
}

// Graph code 190 (OAuthException) or a bare 401: the token expired or was revoked.
export function isExpiredTokenError(error: { fields?: Record<string, string> }): boolean {
  const code = error.fields?.graphCode;
  return code === "190" || code === "401";
}

const MAX_PAGES = 20;
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item).default([]),
    paging: z.object({ next: z.string().optional() }).optional(),
  });

// Follows `paging.next` (only back to Graph itself) up to MAX_PAGES pages.
export async function graphList<T extends z.ZodType>(
  deps: MetaDeps,
  firstUrl: string,
  token: string,
  item: T,
): Promise<Result<z.infer<T>[]>> {
  const items: z.infer<T>[] = [];
  let url: string | undefined = firstUrl;
  for (let n = 0; url && n < MAX_PAGES; n++) {
    const body = await graphGet(deps, url, token);
    if (!body.ok) return body;
    const parsed = page(item).safeParse(body.data);
    if (!parsed.success) return err("INTERNAL", "Respuesta de Meta inesperada");
    items.push(...parsed.data.data);
    const next = parsed.data.paging?.next;
    url = next?.startsWith(GRAPH_ORIGIN) ? next : undefined;
  }
  return ok(items);
}

const metaFormSchema = z.object({ id: id, name: z.string().optional() });
export type MetaForm = z.infer<typeof metaFormSchema>;

/** Lead forms of a Page; also proves the Page token still works. */
export function fetchPageForms(
  deps: MetaDeps,
  pageId: string,
  pageToken: string,
): Promise<Result<MetaForm[]>> {
  const url = `${GRAPH_ORIGIN}${deps.graphVersion}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name&limit=100`;
  return graphList(deps, url, pageToken, metaFormSchema);
}

/** Leads of a form created after `since`. */
export function fetchFormLeads(
  deps: MetaDeps,
  formId: string,
  since: Date,
  pageToken: string,
): Promise<Result<MetaLead[]>> {
  const filtering = JSON.stringify([
    { field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) },
  ]);
  const url = `${GRAPH_ORIGIN}${deps.graphVersion}/${encodeURIComponent(formId)}/leads?fields=${leadFields}&filtering=${encodeURIComponent(filtering)}&limit=100`;
  return graphList(deps, url, pageToken, metaLeadSchema);
}

export async function fetchMetaLead(
  deps: MetaDeps,
  leadgenId: string,
  pageToken: string,
): Promise<Result<MetaLead>> {
  const url = `${GRAPH_ORIGIN}${deps.graphVersion}/${encodeURIComponent(leadgenId)}?fields=${leadFields}`;
  const body = await graphGet(deps, url, pageToken);
  if (!body.ok) return body;
  const lead = metaLeadSchema.safeParse(body.data);
  if (!lead.success) return err("INTERNAL", "Respuesta de Meta inesperada");
  return ok(lead.data);
}

export const leadTargets = ["fullName", "email", "phone", "companyName", "jobTitle", "message"];
type Target = "fullName" | "email" | "phone" | "companyName" | "jobTitle" | "message";

// Meta's standard question keys; an ad form's `field_mapping` adds or overrides entries.
const defaultMapping: Record<string, Target> = {
  full_name: "fullName",
  email: "email",
  phone_number: "phone",
  company_name: "companyName",
  job_title: "jobTitle",
};

export function toExternalLead(
  lead: MetaLead,
  form: { externalFormId: string; name?: string; mapping: Record<string, string> },
): ExternalLead {
  const mapping: Record<string, string> = { ...defaultMapping, ...form.mapping };
  const fields: Partial<Record<Target, string>> = {};
  const rawAnswers: Record<string, string> = {};
  let firstName = "";
  let lastName = "";
  for (const { name, values } of lead.field_data) {
    const value = values.join(", ").trim();
    if (!value) continue;
    const target = mapping[name];
    if (target && leadTargets.includes(target)) fields[target as Target] = value;
    else if (name === "first_name") firstName = value;
    else if (name === "last_name") lastName = value;
    else rawAnswers[name] = value;
  }
  return {
    provider: "meta",
    externalLeadId: lead.id,
    externalFormId: lead.form_id ?? form.externalFormId,
    formName: form.name,
    campaignExternalId: lead.campaign_id,
    adId: lead.ad_id,
    adsetId: lead.adset_id,
    adPlatform: lead.platform === "ig" ? "instagram" : "facebook",
    fullName: fields.fullName ?? (`${firstName} ${lastName}`.trim() || undefined),
    email: fields.email,
    phone: fields.phone,
    companyName: fields.companyName,
    jobTitle: fields.jobTitle,
    message: fields.message,
    rawAnswers,
    submittedAt: lead.created_time,
  };
}
