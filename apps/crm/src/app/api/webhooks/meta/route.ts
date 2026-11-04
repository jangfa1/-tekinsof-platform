import { recordInboundEvent } from "@tekinsof/core/capture/inbound";
import { getDb } from "@tekinsof/core/db/client";
import { parseLeadgenWebhook, verifyMetaSignature } from "@tekinsof/core/integrations/meta";
import { err, httpStatus, ok, type Result } from "@tekinsof/core/result";
import { getEnv } from "@/lib/env";

// Meta Lead Ads webhook (Facebook and Instagram, blueprint R2 §3). It only verifies and records:
// each leadgen notification becomes an inbound_events row + outbox, and `process-inbound` fetches
// the lead. Meta retries anything that is not 2xx, so business problems never answer 5xx.
export const dynamic = "force-dynamic";

function respond(result: Result<unknown>): Response {
  return Response.json(result, { status: result.ok ? 200 : httpStatus[result.error.code] });
}

// Subscription handshake: echo hub.challenge when the verify token matches.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const valid =
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === getEnv().META_VERIFY_TOKEN;
  if (!valid) return new Response("Forbidden", { status: 403 });
  return new Response(params.get("hub.challenge") ?? "", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw text before parsing.
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, signature, getEnv().META_APP_SECRET)) {
    return respond(err("UNAUTHENTICATED", "Firma inválida"));
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return respond(err("VALIDATION_ERROR", "JSON inválido"));
  }
  const parsed = parseLeadgenWebhook(body);
  if (!parsed.ok) return respond(parsed);

  const db = getDb();
  const inboundEventIds: string[] = [];
  let duplicates = 0;
  for (const notification of parsed.data) {
    const recorded = await recordInboundEvent(db, {
      provider: "meta",
      eventType: "leadgen",
      externalId: notification.leadgen_id,
      payload: notification,
      signatureValid: true,
    });
    if (!recorded.ok) return respond(recorded);
    inboundEventIds.push(recorded.data.inboundEventId);
    if (recorded.data.duplicate) duplicates++;
  }
  const received = inboundEventIds.length;
  return respond(
    ok({ received, inboundEventIds, duplicate: received > 0 && duplicates === received }),
  );
}
