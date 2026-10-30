import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import { adForms, inboundEvents, integrationAccounts } from "../db/schema.ts";
import {
  fetchMetaLead,
  leadgenValue,
  type MetaDeps,
  toExternalLead,
} from "../integrations/meta.ts";
import { decryptSecret } from "../integrations/secrets.ts";
import { err, ok, type Result } from "../result.ts";
import { ingestExternalLead } from "./external-leads.ts";
import { type InboundOutcome, markInbound } from "./inbound.ts";

// Runs in the `process-inbound` Inngest function for every `inbound/received` event.
// Contract with the caller: an error Result is transient (network, Graph 5xx, token) and must be
// retried; permanent problems (a lead without contact data, a Page nobody connected) are recorded
// on the inbound event and returned as ok, so retries never repeat them.

export type ProcessDeps = { meta: MetaDeps; encryptionKey: Buffer; now: () => Date };
type Processed = Result<{ status: InboundOutcome; leadId: string | null }>;

async function settle(
  db: DbOrTx,
  inboundEventId: string,
  status: InboundOutcome,
  detail?: string,
): Promise<Processed> {
  await markInbound(db, inboundEventId, status, detail);
  return ok({ status, leadId: null });
}

async function processMeta(
  db: DbOrTx,
  deps: ProcessDeps,
  event: { id: string; payload: unknown },
): Promise<Processed> {
  const notification = leadgenValue.safeParse(event.payload);
  if (!notification.success) return settle(db, event.id, "error", "Notificación leadgen inválida");
  const { leadgen_id, page_id, form_id } = notification.data;

  const [account] = await db
    .select()
    .from(integrationAccounts)
    .where(
      and(
        eq(integrationAccounts.provider, "meta"),
        eq(integrationAccounts.externalAccountId, page_id),
        eq(integrationAccounts.status, "conectada"),
      ),
    );
  if (!account) return settle(db, event.id, "ignorado", `Página ${page_id} sin cuenta conectada`);

  const token = decryptSecret(account.credentialsEncrypted, deps.encryptionKey);
  if (!token.ok) {
    await markInbound(db, event.id, "error", token.error.message);
    return token;
  }
  const lead = await fetchMetaLead(deps.meta, leadgen_id, token.data);
  if (!lead.ok) {
    await markInbound(db, event.id, "error", lead.error.message);
    return lead;
  }

  const [form] = await db
    .select({ name: adForms.name, fieldMapping: adForms.fieldMapping })
    .from(adForms)
    .where(and(eq(adForms.provider, "meta"), eq(adForms.externalFormId, form_id)));
  const external = toExternalLead(lead.data, {
    externalFormId: form_id,
    name: form?.name,
    mapping: (form?.fieldMapping ?? {}) as Record<string, string>,
  });

  const ingested = await ingestExternalLead(db, external);
  if (!ingested.ok) return settle(db, event.id, "error", ingested.error.message);
  await db
    .update(integrationAccounts)
    .set({ lastOkAt: deps.now(), lastError: null })
    .where(eq(integrationAccounts.id, account.id));
  await markInbound(db, event.id, "procesado");
  return ok({ status: "procesado", leadId: ingested.data.leadId });
}

export async function processInbound(
  db: DbOrTx,
  deps: ProcessDeps,
  inboundEventId: string,
): Promise<Processed> {
  const [event] = await db.select().from(inboundEvents).where(eq(inboundEvents.id, inboundEventId));
  if (!event) return err("NOT_FOUND", "Evento no encontrado");
  // A redelivered Inngest event after success: nothing left to do.
  if (event.status === "procesado" || event.status === "ignorado") {
    return ok({ status: event.status, leadId: null });
  }
  switch (event.provider) {
    case "meta":
      return processMeta(db, deps, event);
    default:
      // Google (r2-05) and TikTok (r2-06) adapters plug in here.
      return settle(db, event.id, "ignorado", `Proveedor ${event.provider} aún no soportado`);
  }
}
