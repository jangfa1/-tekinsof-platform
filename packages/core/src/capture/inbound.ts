import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import { inboundEvents, outbox } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

// Webhooks only record what arrived (blueprint R2 §1): the raw body goes to `inbound_events` with an
// `inbound/received` outbox row in the same transaction, and the `process-inbound` Inngest function
// does the rest. A provider retry of the same id is acknowledged without a second event.

export const inboundProviders = ["meta", "tiktok", "google_ads"] as const;
export type InboundProvider = (typeof inboundProviders)[number];

const inboundInput = z.object({
  provider: z.enum(inboundProviders),
  eventType: z.string().trim().min(1).max(60),
  externalId: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  signatureValid: z.boolean(),
});

export async function recordInboundEvent(
  db: DbOrTx,
  input: z.input<typeof inboundInput>,
): Promise<Result<{ inboundEventId: string; duplicate: boolean }>> {
  const parsed = inboundInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const event = parsed.data;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(inboundEvents)
      .values(event)
      .onConflictDoNothing({ target: [inboundEvents.provider, inboundEvents.externalId] })
      .returning({ id: inboundEvents.id });
    if (created) {
      await tx
        .insert(outbox)
        .values({ eventName: "inbound/received", payload: { inboundEventId: created.id } });
      return ok({ inboundEventId: created.id, duplicate: false });
    }
    const [existing] = await tx
      .select({ id: inboundEvents.id })
      .from(inboundEvents)
      .where(
        and(
          eq(inboundEvents.provider, event.provider),
          eq(inboundEvents.externalId, event.externalId),
        ),
      );
    if (!existing) return err("INTERNAL", "No se pudo registrar el evento");
    return ok({ inboundEventId: existing.id, duplicate: true });
  });
}

export type InboundOutcome = "procesado" | "ignorado" | "error";

export async function markInbound(
  db: DbOrTx,
  inboundEventId: string,
  status: InboundOutcome,
  error?: string,
): Promise<void> {
  await db
    .update(inboundEvents)
    .set({
      status,
      error: error ?? null,
      attempts: sql`${inboundEvents.attempts} + 1`,
      processedAt: status === "error" ? null : new Date(),
    })
    .where(eq(inboundEvents.id, inboundEventId));
}
