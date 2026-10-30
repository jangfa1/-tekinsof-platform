import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ExternalLead } from "../capture/external-leads.ts";
import { err, ok, type Result } from "../result.ts";

// TikTok Lead Generation through our own normalized contract, so a connector (LeadsBridge, Zapier,
// Make) can post to it today and TikTok's own webhook can be adapted later without touching the
// pipeline. The sender signs the raw body: `X-Tekinsof-Signature: sha256=<hex HMAC-SHA256>` with
// TIKTOK_WEBHOOK_SECRET.

export function verifyTekinsofSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const id = z.coerce.string().trim().min(1);

// Unix seconds (TikTok's own format) or an ISO string (what most connectors send).
const createdTime = z.union([z.number(), z.string().min(1)]).transform((value, ctx) => {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Fecha inválida" });
    return z.NEVER;
  }
  return date;
});

export const tiktokLeadSchema = z.object({
  lead_id: id,
  form_id: id,
  form_name: z.string().trim().min(1).optional(),
  campaign_id: id.optional(),
  ad_id: id.optional(),
  adgroup_id: id.optional(),
  created_time: createdTime,
  is_test: z.boolean().default(false),
  fields: z.record(z.string(), z.coerce.string()).default({}),
});
export type TiktokLead = z.infer<typeof tiktokLeadSchema>;

export function parseTiktokLead(body: unknown): Result<TiktokLead> {
  const parsed = tiktokLeadSchema.safeParse(body);
  if (!parsed.success) return err("VALIDATION_ERROR", "Payload de TikTok inválido");
  return ok(parsed.data);
}

type Target = "fullName" | "email" | "phone" | "companyName" | "jobTitle" | "message";

const knownFields: Record<string, Target> = {
  name: "fullName",
  email: "email",
  phone: "phone",
  company: "companyName",
  job_title: "jobTitle",
  message: "message",
};

export function toExternalLead(lead: TiktokLead): ExternalLead {
  const fields: Partial<Record<Target, string>> = {};
  const rawAnswers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(lead.fields)) {
    const value = raw.trim();
    if (!value) continue;
    const target = knownFields[name];
    if (target) fields[target] = value;
    else rawAnswers[name] = value;
  }
  return {
    provider: "tiktok",
    externalLeadId: lead.lead_id,
    externalFormId: lead.form_id,
    formName: lead.form_name,
    campaignExternalId: lead.campaign_id,
    adId: lead.ad_id,
    adsetId: lead.adgroup_id,
    adPlatform: "tiktok",
    ...fields,
    rawAnswers,
    submittedAt: lead.created_time,
    isTest: lead.is_test,
  };
}
