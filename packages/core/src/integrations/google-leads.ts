import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ExternalLead } from "../capture/external-leads.ts";
import { recordInboundEvent } from "../capture/inbound.ts";
import type { DbOrTx } from "../db/client.ts";
import { adForms } from "../db/schema.ts";
import { err, ok, type Result } from "../result.ts";
import { decryptSecret } from "./secrets.ts";

// Google Ads lead form webhook. Google posts the whole lead to the URL configured on the form,
// one URL per ad form (`/api/webhooks/google-leads/<adFormId>`), with the form's key in
// `google_key`. Fields are identified by `column_id`; `column_name` is localized and never used.

const id = z.coerce.string().min(1);

const googleLeadSchema = z.object({
  lead_id: id,
  form_id: id,
  campaign_id: id.optional(),
  adgroup_id: id.optional(),
  creative_id: id.optional(),
  gcl_id: z.string().optional(),
  google_key: z.string().default(""),
  is_test: z.boolean().default(false),
  lead_submit_time: z.string().optional(),
  user_column_data: z
    .array(z.object({ column_id: z.string().min(1), string_value: z.coerce.string().default("") }))
    .default([]),
});
export type GoogleLead = z.infer<typeof googleLeadSchema>;

// Unknown top-level keys (api_version, column_name…) are dropped by zod's default strip.
export function parseGoogleLead(body: unknown): Result<GoogleLead> {
  const parsed = googleLeadSchema.safeParse(body);
  if (!parsed.success) return err("VALIDATION_ERROR", "Payload de Google inválido");
  return ok(parsed.data);
}

// Hashing first gives equal-length buffers, so the comparison is constant-time for any input.
export function verifyGoogleKey(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(received), digest(expected));
}

type Target = "fullName" | "email" | "phone" | "companyName" | "jobTitle" | "message";
const targets: readonly string[] = [
  "fullName",
  "email",
  "phone",
  "companyName",
  "jobTitle",
  "message",
];

// Google's standard column ids; an ad form's `field_mapping` adds or overrides entries.
const defaultMapping: Record<string, Target> = {
  FULL_NAME: "fullName",
  EMAIL: "email",
  WORK_EMAIL: "email",
  PHONE_NUMBER: "phone",
  WORK_PHONE: "phone",
  COMPANY_NAME: "companyName",
  JOB_TITLE: "jobTitle",
};

export function toExternalLead(
  lead: GoogleLead,
  form: { externalFormId: string; name?: string; mapping: Record<string, string> },
  receivedAt: Date,
): ExternalLead {
  const mapping: Record<string, string> = { ...defaultMapping, ...form.mapping };
  const fields: Partial<Record<Target, string>> = {};
  const rawAnswers: Record<string, string> = {};
  let firstName = "";
  let lastName = "";
  for (const { column_id, string_value } of lead.user_column_data) {
    const value = string_value.trim();
    if (!value) continue;
    const target = mapping[column_id];
    if (target && targets.includes(target)) fields[target as Target] ??= value;
    else if (column_id === "FIRST_NAME") firstName = value;
    else if (column_id === "LAST_NAME") lastName = value;
    else rawAnswers[column_id] = value;
  }
  const submitted = lead.lead_submit_time ? new Date(lead.lead_submit_time) : receivedAt;
  return {
    provider: "google_ads",
    externalLeadId: lead.lead_id,
    externalFormId: form.externalFormId,
    formName: form.name,
    campaignExternalId: lead.campaign_id,
    adId: lead.creative_id,
    adsetId: lead.adgroup_id,
    adPlatform: "google",
    fullName: fields.fullName ?? (`${firstName} ${lastName}`.trim() || undefined),
    email: fields.email,
    phone: fields.phone,
    companyName: fields.companyName,
    jobTitle: fields.jobTitle,
    message: fields.message,
    gclid: lead.gcl_id,
    rawAnswers,
    submittedAt: Number.isNaN(submitted.getTime()) ? receivedAt : submitted,
    isTest: lead.is_test,
  };
}

const uuid = z.uuid();

// Webhook entry point: the form must exist, be active and have a key; the key must match. Only then
// is the lead recorded (without the key) for `process-inbound`. Nothing is stored otherwise.
export async function receiveGoogleLead(
  db: DbOrTx,
  deps: { encryptionKey: Buffer },
  adFormId: string,
  body: unknown,
): Promise<Result<{ inboundEventId: string; duplicate: boolean }>> {
  if (!uuid.safeParse(adFormId).success) return err("NOT_FOUND", "Formulario no encontrado");
  const [form] = await db
    .select({ webhookKeyEncrypted: adForms.webhookKeyEncrypted })
    .from(adForms)
    .where(
      and(eq(adForms.id, adFormId), eq(adForms.provider, "google_ads"), eq(adForms.isActive, true)),
    );
  if (!form?.webhookKeyEncrypted) return err("NOT_FOUND", "Formulario no encontrado");

  const lead = parseGoogleLead(body);
  if (!lead.ok) return lead;
  const key = decryptSecret(form.webhookKeyEncrypted, deps.encryptionKey);
  if (!key.ok) return key;
  if (!verifyGoogleKey(lead.data.google_key, key.data)) {
    return err("UNAUTHENTICATED", "Clave de Google inválida");
  }

  const { google_key: _key, ...payload } = lead.data;
  return recordInboundEvent(db, {
    provider: "google_ads",
    eventType: "lead",
    externalId: lead.data.lead_id,
    payload: { ...payload, ad_form_id: adFormId },
    signatureValid: true,
  });
}
