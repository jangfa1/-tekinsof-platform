import { getDb } from "@tekinsof/core/db/client";
import { createPublicLead } from "@tekinsof/core/leads/leads";
import { publicLeadInput } from "@tekinsof/core/leads/schemas";
import { err, httpStatus, type Result, validationError } from "@tekinsof/core/result";
import { getEnv } from "@/lib/env";

// The only write path from the public site (blueprint §5). Never calls Inngest: the lead and its
// outbox row are committed together and the outbox-flush cron delivers the event.
export const dynamic = "force-dynamic";

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function respond(result: Result<unknown>, origin: string, okStatus = 200): Response {
  const status = result.ok ? okStatus : httpStatus[result.error.code];
  return Response.json(result, { status, headers: corsHeaders(origin) });
}

// Cloudflare's documented test secrets (1x… always passes, 2x… always fails) are emulated without
// network so no gate leaves the machine; env.ts refuses them in production.
async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  if (secret.startsWith("1x")) return true;
  if (secret.startsWith("2x")) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders(getEnv().SITE_ORIGIN) });
}

export async function POST(request: Request) {
  const { SITE_ORIGIN, TURNSTILE_SECRET_KEY } = getEnv();
  if (request.headers.get("origin") !== SITE_ORIGIN) {
    return respond(err("ORIGIN_NOT_ALLOWED", "Origen no permitido"), SITE_ORIGIN);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(err("VALIDATION_ERROR", "Datos inválidos"), SITE_ORIGIN);
  }

  const parsed = publicLeadInput.safeParse(body);
  if (!parsed.success) return respond(validationError(parsed.error), SITE_ORIGIN);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyTurnstile(TURNSTILE_SECRET_KEY, parsed.data.turnstileToken, ip))) {
    return respond(err("CAPTCHA_FAILED", "No pudimos verificar el envío"), SITE_ORIGIN);
  }

  const result = await createPublicLead(getDb(), body as Parameters<typeof createPublicLead>[1]);
  const created = result.ok && !result.data.deduplicated;
  return respond(result, SITE_ORIGIN, created ? 201 : 200);
}
