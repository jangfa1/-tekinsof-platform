import { recordInboundEvent } from "@tekinsof/core/capture/inbound";
import { getDb } from "@tekinsof/core/db/client";
import { parseTiktokLead, verifyTekinsofSignature } from "@tekinsof/core/integrations/tiktok";
import { err, httpStatus, type Result } from "@tekinsof/core/result";
import { getEnv } from "@/lib/env";

// TikTok Lead Ads webhook (blueprint R2, step r2-06), fed by a connector with our normalized,
// signed contract. It only verifies and records; `process-inbound` creates the lead.
export const dynamic = "force-dynamic";

function respond(result: Result<unknown>): Response {
  return Response.json(result, { status: result.ok ? 200 : httpStatus[result.error.code] });
}

export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw text before parsing.
  const raw = await request.text();
  const signature = request.headers.get("x-tekinsof-signature");
  if (!verifyTekinsofSignature(raw, signature, getEnv().TIKTOK_WEBHOOK_SECRET)) {
    return respond(err("UNAUTHENTICATED", "Firma inválida"));
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return respond(err("VALIDATION_ERROR", "JSON inválido"));
  }
  const lead = parseTiktokLead(body);
  if (!lead.ok) return respond(lead);

  return respond(
    await recordInboundEvent(getDb(), {
      provider: "tiktok",
      eventType: "lead",
      externalId: lead.data.lead_id,
      payload: body as Record<string, unknown>,
      signatureValid: true,
    }),
  );
}
