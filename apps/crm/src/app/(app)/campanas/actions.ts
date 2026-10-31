"use server";

import { getDb } from "@tekinsof/core/db/client";
import {
  decimalToCents,
  mapMetaCampaign,
  recordManualSpend,
  type SpendPlatform,
  unmapMetaCampaign,
} from "@tekinsof/core/marketing/spend";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CAMPAIGNS_PATH } from "@/components/campaigns/labels";
import { authorize } from "@/lib/actor";

// Redirect-based forms: the outcome travels in the query of the page the form came from.
const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function failure(
  path: string,
  error: { message: string; fields?: Record<string, string> },
  extra: Record<string, string> = {},
): never {
  const params: Record<string, string> = { error: error.message, ...extra };
  for (const [field, message] of Object.entries(error.fields ?? {})) params[`e_${field}`] = message;
  back(path, params);
}

// The form tells where it lives: the campaign list or a campaign's spend page.
function returnPath(formData: FormData): string {
  const campaignId = str(formData, "returnTo");
  return campaignId ? `${CAMPAIGNS_PATH}/${campaignId}/gasto` : CAMPAIGNS_PATH;
}

export async function mapCampaignAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await authorize("campaigns.write");
  if (!actor.ok) failure(path, actor.error);
  const result = await mapMetaCampaign(getDb(), actor.data, {
    campaignId: str(formData, "campaignId"),
    externalCampaignId: str(formData, "externalCampaignId"),
  });
  if (!result.ok) failure(path, result.error);
  revalidatePath(CAMPAIGNS_PATH, "layout");
  const days = result.data.attachedRows;
  back(path, {
    ok: days > 0 ? `Campaña asociada: ${days} registros de gasto recuperados` : "Campaña asociada",
  });
}

export async function unmapCampaignAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await authorize("campaigns.write");
  if (!actor.ok) failure(path, actor.error);
  const result = await unmapMetaCampaign(getDb(), actor.data, {
    campaignId: str(formData, "campaignId"),
    externalCampaignId: str(formData, "externalCampaignId"),
  });
  if (!result.ok) failure(path, result.error);
  revalidatePath(CAMPAIGNS_PATH, "layout");
  back(path, { ok: "Asociación quitada; su gasto vuelve a «sin asociar»" });
}

export async function recordSpendAction(formData: FormData) {
  const campaignId = str(formData, "campaignId");
  const path = `${CAMPAIGNS_PATH}/${campaignId}/gasto`;
  const actor = await authorize("campaigns.write");
  if (!actor.ok) failure(path, actor.error);
  const amount = str(formData, "amount");
  const typed = { v_date: str(formData, "date"), v_amount: amount };
  const spendCents = decimalToCents(amount);
  if (spendCents === null) {
    const negative = amount.trim().startsWith("-");
    failure(
      path,
      {
        message: "Datos inválidos",
        fields: {
          amount: negative ? "El monto no puede ser negativo" : "Escribe un monto como 1250.50",
        },
      },
      typed,
    );
  }
  const result = await recordManualSpend(getDb(), actor.data, {
    campaignId,
    date: str(formData, "date"),
    adPlatform: str(formData, "adPlatform") as SpendPlatform,
    spendCents,
    currency: str(formData, "currency") as "PEN" | "USD",
  });
  if (!result.ok) {
    const { spendCents: amountError, ...fields } = result.error.fields ?? {};
    failure(
      path,
      { ...result.error, fields: amountError ? { ...fields, amount: amountError } : fields },
      typed,
    );
  }
  revalidatePath(CAMPAIGNS_PATH, "layout");
  back(path, { ok: "Gasto registrado" });
}
