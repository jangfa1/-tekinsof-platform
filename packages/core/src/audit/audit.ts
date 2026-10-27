import type { DbOrTx } from "../db/client.ts";
import { auditEvents } from "../db/schema.ts";

export type AuditInput = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

// Call inside the same transaction as the change it records. `action` is a stable `object.verb`
// contract (e.g. `user.invited`): never rename an existing action.
export async function writeAudit(tx: DbOrTx, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
    requestId: input.requestId ?? null,
  });
}
