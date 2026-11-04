import { getDb } from "@tekinsof/core/db/client";
import { receiveGoogleLead } from "@tekinsof/core/integrations/google-leads";
import { err, httpStatus, type Result } from "@tekinsof/core/result";
import { getEnv } from "@/lib/env";

// Google Ads lead form webhook (blueprint R2, step r2-05). One URL per ad form; the body carries the
// form's key. It only verifies and records — `process-inbound` creates the lead.
export const dynamic = "force-dynamic";

function respond(result: Result<unknown>): Response {
  return Response.json(result, { status: result.ok ? 200 : httpStatus[result.error.code] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ adFormId: string }> },
) {
  const { adFormId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(err("VALIDATION_ERROR", "JSON inválido"));
  }
  const encryptionKey = Buffer.from(getEnv().INTEGRATIONS_ENCRYPTION_KEY, "base64");
  return respond(await receiveGoogleLead(getDb(), { encryptionKey }, adFormId, body));
}
