"use server";

import { getDb } from "@tekinsof/core/db/client";
import { updateLeadQualification } from "@tekinsof/core/scoring/lead-scoring";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/actor";

// Same feedback contract as the actions in page.tsx: messages and field errors in the query.
function back(id: string, params: Record<string, string>): never {
  redirect(`/leads/${id}?${new URLSearchParams(params).toString()}`);
}

export async function qualifyLead(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const actor = await authorize("leads.read");
  if (!actor.ok) back(leadId, { error: actor.error.message });
  const result = await updateLeadQualification(
    getDb(),
    actor.data,
    {
      leadId,
      companySize: String(formData.get("companySize") ?? ""),
      budgetRange: String(formData.get("budgetRange") ?? ""),
      companyType: String(formData.get("companyType") ?? ""),
    },
    new Date(),
  );
  if (!result.ok) {
    const params: Record<string, string> = { error: result.error.message };
    for (const [field, message] of Object.entries(result.error.fields ?? {})) {
      params[`e_${field}`] = message;
    }
    back(leadId, params);
  }
  back(leadId, { ok: result.data ? `Calificación: ${result.data.grade}` : "Datos guardados" });
}
