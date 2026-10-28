import { getDb } from "@tekinsof/core/db/client";
import { httpStatus } from "@tekinsof/core/result";
import { ensureQuotePdf } from "@tekinsof/core/sales/quote-delivery";
import { createFileStore } from "@tekinsof/core/storage/files";
import { authorize } from "@/lib/actor";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await authorize("quotes.read");
  if (!actor.ok) return Response.json(actor, { status: httpStatus[actor.error.code] });
  const env = getEnv();
  const store = createFileStore({
    driver: env.STORAGE_DRIVER,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: "quotes",
  });
  const pdf = await ensureQuotePdf(getDb(), { store }, (await params).id);
  if (!pdf.ok) return Response.json(pdf, { status: httpStatus[pdf.error.code] });
  return new Response(Buffer.from(pdf.data.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.data.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
