"use server";

import { getDb } from "@tekinsof/core/db/client";
import {
  connectMetaAdAccount,
  connectMetaPage,
  disconnectAccount,
} from "@tekinsof/core/integrations/accounts";
import { createGoogleAdForm, mapAdForm } from "@tekinsof/core/integrations/ad-forms";
import { sendTestLead, type TestRun } from "@tekinsof/core/integrations/testing";
import type { Result } from "@tekinsof/core/result";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/actor";
import { getEnv } from "@/lib/env";
import { currentOrganizationId } from "@/lib/organization";

const PATH = "/configuracion/integraciones";

function integrationDeps() {
  const env = getEnv();
  return {
    organizationId: currentOrganizationId(),
    encryptionKey: Buffer.from(env.INTEGRATIONS_ENCRYPTION_KEY, "base64"),
  };
}

export async function connectMetaAction(input: {
  pageId: string;
  displayName: string;
  pageToken: string;
}): Promise<Result<{ accountId: string }>> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return actor;
  const result = await connectMetaPage(getDb(), actor.data, integrationDeps(), input);
  if (result.ok) revalidatePath(PATH, "layout");
  return result;
}

export async function connectMetaAdAccountAction(input: {
  adAccountId: string;
  displayName: string;
  token: string;
}): Promise<Result<{ accountId: string }>> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return actor;
  const result = await connectMetaAdAccount(getDb(), actor.data, integrationDeps(), input);
  if (result.ok) revalidatePath(PATH, "layout");
  return result;
}

export async function disconnectAction(input: {
  accountId: string;
}): Promise<Result<{ accountId: string }>> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return actor;
  const result = await disconnectAccount(getDb(), actor.data, integrationDeps(), input);
  if (result.ok) revalidatePath(PATH, "layout");
  return result;
}

export async function mapFormAction(input: {
  adFormId: string;
  campaignId: string;
}): Promise<Result<{ adFormId: string }>> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return actor;
  const result = await mapAdForm(getDb(), actor.data, integrationDeps(), input);
  if (result.ok) revalidatePath(PATH, "layout");
  return result;
}

export type CreateFormState =
  | { status: "idle" }
  | { status: "created"; name: string; webhookUrl: string; key: string }
  | { status: "error"; message: string; fields?: Record<string, string> };

// The key travels only in this response: it is never stored in plain text nor put in a URL.
export async function createGoogleFormAction(
  _prev: CreateFormState,
  formData: FormData,
): Promise<CreateFormState> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return { status: "error", message: actor.error.message };
  const name = String(formData.get("name") ?? "");
  const result = await createGoogleAdForm(
    getDb(),
    actor.data,
    { ...integrationDeps(), crmBaseUrl: getEnv().CRM_BASE_URL },
    { name, campaignId: String(formData.get("campaignId") ?? "") },
  );
  if (!result.ok) {
    return { status: "error", message: result.error.message, fields: result.error.fields };
  }
  revalidatePath(PATH, "layout");
  return { status: "created", name: name.trim(), ...result.data };
}

export type TestState =
  | { status: "idle" }
  | { status: "done"; run: TestRun }
  | { status: "error"; message: string };

export async function sendTestLeadAction(_prev: TestState, formData: FormData): Promise<TestState> {
  const actor = await authorize("integrations.manage");
  if (!actor.ok) return { status: "error", message: actor.error.message };
  const env = getEnv();
  const { organizationId, encryptionKey } = integrationDeps();
  const result = await sendTestLead(
    getDb(),
    actor.data,
    {
      organizationId,
      tiktokSecret: env.TIKTOK_WEBHOOK_SECRET,
      now: () => new Date(),
      process: {
        meta: { fetch, graphVersion: env.META_GRAPH_VERSION },
        encryptionKey,
        now: () => new Date(),
      },
    },
    {
      integration: String(formData.get("integration") ?? "") as "google" | "tiktok",
      adFormId: String(formData.get("adFormId") ?? ""),
    },
  );
  if (!result.ok) return { status: "error", message: result.error.message };
  revalidatePath(PATH, "layout");
  return { status: "done", run: result.data };
}
