import { createHmac, randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import { inboundProviders, recordInboundEvent } from "../capture/inbound.ts";
import { type ProcessDeps, processInbound } from "../capture/process-inbound.ts";
import type { DbOrTx } from "../db/client.ts";
import { adForms, inboundEvents } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";
import { receiveGoogleLead } from "./google-leads.ts";
import { decryptSecret } from "./secrets.ts";
import { verifyTekinsofSignature } from "./tiktok.ts";

// The "Pruebas" tab: the webhook log and a test lead that runs the real path (verification →
// inbound event → process-inbound → lead). Test leads carry `is_test`, so they are never assigned
// nor counted. Meta is tested with Meta's own Lead Ads Testing Tool: its events need Graph.

export const inboundStatuses = ["recibido", "procesado", "ignorado", "error"] as const;

const logInput = z.object({
  provider: z.enum(inboundProviders).optional().catch(undefined),
  status: z.enum(inboundStatuses).optional().catch(undefined),
  limit: z.number().int().min(1).max(200).default(50),
});

export type InboundLogRow = {
  id: string;
  provider: string;
  eventType: string;
  externalId: string;
  signatureValid: boolean;
  status: string;
  attempts: number;
  error: string | null;
  receivedAt: Date;
  processedAt: Date | null;
};

// The payload is never returned: it holds the lead's personal data.
export function listInboundEvents(
  db: DbOrTx,
  organizationId: string,
  filters: z.input<typeof logInput> = {},
): Promise<InboundLogRow[]> {
  const { provider, status, limit } = logInput.parse(filters);
  const where: SQL[] = [eq(inboundEvents.organizationId, organizationId)];
  if (provider) where.push(eq(inboundEvents.provider, provider));
  if (status) where.push(eq(inboundEvents.status, status));
  return db
    .select({
      id: inboundEvents.id,
      provider: inboundEvents.provider,
      eventType: inboundEvents.eventType,
      externalId: inboundEvents.externalId,
      signatureValid: inboundEvents.signatureValid,
      status: inboundEvents.status,
      attempts: inboundEvents.attempts,
      error: inboundEvents.error,
      receivedAt: inboundEvents.receivedAt,
      processedAt: inboundEvents.processedAt,
    })
    .from(inboundEvents)
    .where(and(...where))
    .orderBy(desc(inboundEvents.receivedAt))
    .limit(limit);
}

export type TestStep = { label: string; ok: boolean; detail?: string };
export type TestRun = { steps: TestStep[]; leadId: string | null };

export type TestDeps = {
  organizationId: string;
  process: ProcessDeps;
  tiktokSecret: string;
  now: () => Date;
};

const testInput = z.object({
  integration: z.enum(["google", "tiktok"], "Elige una integración"),
  adFormId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
});

const sample = { name: "Lead de prueba", email: "prueba@example.com" };

async function recordGoogleTest(
  db: DbOrTx,
  deps: TestDeps,
  adFormId: string | undefined,
  leadId: string,
): Promise<Result<{ inboundEventId: string }>> {
  const where = [
    eq(adForms.organizationId, deps.organizationId),
    eq(adForms.provider, "google_ads"),
    eq(adForms.isActive, true),
    isNotNull(adForms.webhookKeyEncrypted),
  ];
  if (adFormId) where.push(eq(adForms.id, adFormId));
  const [form] = await db
    .select({ id: adForms.id, sealed: adForms.webhookKeyEncrypted })
    .from(adForms)
    .where(and(...where))
    .orderBy(desc(adForms.createdAt))
    .limit(1);
  if (!form?.sealed) return err("NOT_FOUND", "Crea primero un formulario de Google");
  const key = decryptSecret(form.sealed, deps.process.encryptionKey);
  if (!key.ok) return key;
  // The same function the webhook route calls: it checks the key before recording.
  const recorded = await receiveGoogleLead(db, deps.process, form.id, {
    lead_id: leadId,
    form_id: "prueba-crm",
    google_key: key.data,
    is_test: true,
    user_column_data: [
      { column_id: "FULL_NAME", string_value: sample.name },
      { column_id: "EMAIL", string_value: sample.email },
    ],
  });
  return recorded.ok ? ok({ inboundEventId: recorded.data.inboundEventId }) : recorded;
}

async function recordTiktokTest(
  db: DbOrTx,
  deps: TestDeps,
  leadId: string,
): Promise<Result<{ inboundEventId: string }>> {
  const body = {
    lead_id: leadId,
    form_id: "prueba-crm",
    form_name: "Prueba del CRM",
    created_time: deps.now().toISOString(),
    is_test: true,
    fields: sample,
  };
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", deps.tiktokSecret).update(raw).digest("hex")}`;
  if (!verifyTekinsofSignature(raw, signature, deps.tiktokSecret)) {
    return err("UNAUTHENTICATED", "Falta configurar TIKTOK_WEBHOOK_SECRET");
  }
  const recorded = await recordInboundEvent(db, {
    provider: "tiktok",
    eventType: "lead",
    externalId: leadId,
    payload: body,
    signatureValid: true,
  });
  return recorded.ok ? ok({ inboundEventId: recorded.data.inboundEventId }) : recorded;
}

export async function sendTestLead(
  db: DbOrTx,
  actor: Actor,
  deps: TestDeps,
  input: z.input<typeof testInput>,
): Promise<Result<TestRun>> {
  if (!can(actor, "integrations.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = testInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { integration, adFormId } = parsed.data;
  const externalId = `prueba-${randomUUID()}`;
  const steps: TestStep[] = [];

  const recorded =
    integration === "google"
      ? await recordGoogleTest(db, deps, adFormId, externalId)
      : await recordTiktokTest(db, deps, externalId);
  const verifyLabel = integration === "google" ? "Clave del formulario" : "Firma HMAC";
  if (!recorded.ok) {
    // A missing form is a setup problem, not a failed verification.
    if (recorded.error.code === "NOT_FOUND") return recorded;
    steps.push({ label: verifyLabel, ok: false, detail: recorded.error.message });
    return ok({ steps, leadId: null });
  }
  steps.push({ label: verifyLabel, ok: true }, { label: "Evento registrado", ok: true });

  const processed = await processInbound(db, deps.process, recorded.data.inboundEventId);
  const leadId = processed.ok ? processed.data.leadId : null;
  steps.push(
    leadId
      ? { label: "Lead creado", ok: true, detail: "Marcado como prueba: no se asigna ni cuenta" }
      : {
          label: "Lead creado",
          ok: false,
          detail: processed.ok ? `Evento ${processed.data.status}` : processed.error.message,
        },
  );
  await writeAudit(db, {
    actorId: actor.id,
    action: "integration.test_sent",
    targetType: "inbound_event",
    targetId: recorded.data.inboundEventId,
    metadata: { integration, leadId },
  });
  return ok({ steps, leadId });
}
