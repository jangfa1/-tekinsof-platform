export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "crm",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  });
}
