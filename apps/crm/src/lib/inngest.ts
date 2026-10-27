import { handleLeadCreated } from "@tekinsof/core/automation/lead-created";
import { getDb } from "@tekinsof/core/db/client";
import { createMailer } from "@tekinsof/core/integrations/graph";
import { Inngest } from "inngest";
import { getEnv } from "./env";

// Inngest v4: triggers live in the function configuration. Nothing in the app sends events directly;
// rows in `outbox` are delivered by the outbox-flush cron (step 12).
export const inngest = new Inngest({ id: "tekinsof-crm" });

const deps = () => {
  const env = getEnv();
  return {
    mailer: createMailer({
      driver: env.MAIL_DRIVER,
      tenantId: env.GRAPH_TENANT_ID,
      clientId: env.GRAPH_CLIENT_ID,
      clientSecret: env.GRAPH_CLIENT_SECRET,
    }),
    systemSender: env.GRAPH_SYSTEM_SENDER ?? "notificaciones@tekinsof.com",
    crmBaseUrl: env.CRM_BASE_URL,
    now: () => new Date(),
  };
};

const leadCreated = inngest.createFunction(
  { id: "lead-created", triggers: [{ event: "lead/created" }], retries: 4 },
  async ({ event, step }) =>
    step.run("handle-lead-created", () =>
      handleLeadCreated(getDb(), deps(), (event.data as { leadId: string }).leadId),
    ),
);

export const functions = [leadCreated];
