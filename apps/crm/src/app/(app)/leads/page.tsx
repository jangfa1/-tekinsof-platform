import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Leads" };

// Provisional: replaced by the lead inbox in 02-captacion.
export default async function LeadsPage() {
  await requirePermissionPage("leads.read");
  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">Leads</h1>
      <p className="mt-2 text-fg-muted">Aún no hay leads</p>
    </div>
  );
}
