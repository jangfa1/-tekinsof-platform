import { handleLeadCreated } from "@tekinsof/core/automation/lead-created";
import {
  activityReminderSweep,
  entraSync,
  flushOutbox,
  notifyApprovalRequested,
  quoteExpirySweep,
  slaSweep,
  triggerSiteDeploy,
} from "@tekinsof/core/automation/sweeps";
import { getDb } from "@tekinsof/core/db/client";
import { createMailer } from "@tekinsof/core/integrations/graph";
import { Inngest } from "inngest";
import { getEnv } from "./env";

// Inngest v4: triggers live in the function configuration. Nothing in the app sends events directly;
// rows in `outbox` are delivered by the outbox-flush cron.
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

// Cron schedules are UTC; Lima is UTC−05:00.
const sla = inngest.createFunction(
  { id: "sla-sweep", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => step.run("sla-sweep", () => slaSweep(getDb(), deps(), new Date())),
);

const reminders = inngest.createFunction(
  { id: "activity-reminders", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) =>
    step.run("activity-reminders", () => activityReminderSweep(getDb(), deps(), new Date())),
);

const quoteExpiry = inngest.createFunction(
  { id: "quote-expiry", triggers: [{ cron: "0 14 * * *" }] },
  async ({ step }) => step.run("quote-expiry", () => quoteExpirySweep(getDb(), deps(), new Date())),
);

const outboxFlush = inngest.createFunction(
  { id: "outbox-flush", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) =>
    step.run("outbox-flush", () =>
      flushOutbox(
        getDb(),
        { send: (e) => inngest.send({ name: e.name, data: e.data as Record<string, unknown> }) },
        new Date(),
      ),
    ),
);

const entra = inngest.createFunction(
  { id: "entra-sync", triggers: [{ cron: "0 11 * * *" }] },
  async ({ step }) => step.run("entra-sync", () => entraSync(getDb(), deps(), new Date())),
);

const siteDeploy = inngest.createFunction(
  {
    id: "site-deploy",
    triggers: [{ event: "site/publish.requested" }],
    debounce: { period: "2m" },
  },
  async ({ event, step }) =>
    step.run("site-deploy", () =>
      triggerSiteDeploy(
        getDb(),
        { hookUrl: getEnv().VERCEL_DEPLOY_HOOK_URL },
        (event.data as { sitePublishId: string }).sitePublishId,
      ),
    ),
);

const approvalRequested = inngest.createFunction(
  { id: "quote-approval-requested", triggers: [{ event: "quote/approval.requested" }] },
  async ({ event, step }) =>
    step.run("notify-approval-requested", () =>
      notifyApprovalRequested(getDb(), deps(), (event.data as { quoteId: string }).quoteId),
    ),
);

export const functions = [
  leadCreated,
  sla,
  reminders,
  quoteExpiry,
  outboxFlush,
  // With the log mailer every account looks enabled, so the sync would be a no-op: skip it.
  ...(getEnv().MAIL_DRIVER === "log" ? [] : [entra]),
  siteDeploy,
  approvalRequested,
];
