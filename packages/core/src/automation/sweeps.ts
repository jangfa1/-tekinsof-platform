import { and, asc, eq, gte, isNull, like, lt, lte, not } from "drizzle-orm";
import { writeAudit } from "../audit/audit.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  activities,
  holidays,
  leads,
  outbox,
  quotes,
  sessions,
  sitePublishes,
  users,
} from "../db/schema.ts";
import { escapeHtml, type Mailer } from "../integrations/graph.ts";
import { err, ok, type Result } from "../result.ts";
import { addBusinessHours, limaDate } from "../time/business-hours.ts";

// Cron-driven sweeps (Inngest, apps/crm/src/lib/inngest.ts). Each one is idempotent through a
// marker column (`sla_alerted_at`, `reminded_at`, `expiry_alerted_at`, `sent_at`), so a retry or an
// overlapping run never sends the same mail twice.

export type SweepDeps = { mailer: Mailer; systemSender: string; crmBaseUrl: string };
type Processed = Result<{ processed: number }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const SLA_HOURS = 4;

async function holidaySet(db: DbOrTx): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays);
  return new Set(rows.map((row) => row.date));
}

async function activeManagers(db: DbOrTx) {
  return db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "gerencia"), eq(users.isActive, true)));
}

async function mailAll(deps: SweepDeps, to: string[], subject: string, html: string) {
  let delivered = 0;
  for (const address of to) {
    const sent = await deps.mailer.send({ from: deps.systemSender, to: [address], subject, html });
    if (sent.ok) delivered++;
  }
  return delivered;
}

export async function slaSweep(db: DbOrTx, deps: SweepDeps, now: Date): Promise<Processed> {
  const free = await holidaySet(db);
  const managers = (await activeManagers(db)).map((m) => m.email);
  const pending = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      createdAt: leads.createdAt,
      slaDueAt: leads.slaDueAt,
      ownerName: users.name,
    })
    .from(leads)
    .leftJoin(users, eq(leads.ownerId, users.id))
    .where(
      and(
        eq(leads.status, "nuevo"),
        isNull(leads.firstContactedAt),
        isNull(leads.slaAlertedAt),
        isNull(leads.deletedAt),
        gte(leads.createdAt, new Date(now.getTime() - 14 * DAY_MS)),
      ),
    );
  let processed = 0;
  for (const lead of pending) {
    const due = addBusinessHours(lead.createdAt, SLA_HOURS, free);
    if (!lead.slaDueAt) await db.update(leads).set({ slaDueAt: due }).where(eq(leads.id, lead.id));
    if (due > now) continue;
    const link = `${deps.crmBaseUrl}/leads/${lead.id}`;
    const html = [
      `<p>El lead <strong>${escapeHtml(lead.fullName)}</strong> lleva ${SLA_HOURS} horas laborables sin primer contacto.</p>`,
      `<p>Dueño: ${escapeHtml(lead.ownerName ?? "sin asignar")}</p>`,
      `<p><a href="${escapeHtml(link)}">Abrir el lead</a></p>`,
    ].join("");
    // Marked as alerted once Gerencia was reached, so the next run does not repeat the alert.
    if ((await mailAll(deps, managers, `Lead sin atender: ${lead.fullName}`, html)) > 0) {
      await db.update(leads).set({ slaAlertedAt: now }).where(eq(leads.id, lead.id));
      processed++;
    }
  }
  return ok({ processed });
}

export async function activityReminderSweep(
  db: DbOrTx,
  deps: SweepDeps,
  now: Date,
): Promise<Processed> {
  const due = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      leadId: activities.leadId,
      opportunityId: activities.opportunityId,
      ownerEmail: users.email,
    })
    .from(activities)
    .innerJoin(users, eq(activities.ownerId, users.id))
    .where(
      and(
        isNull(activities.doneAt),
        isNull(activities.remindedAt),
        lte(activities.dueAt, new Date(now.getTime() + 15 * 60 * 1000)),
      ),
    );
  let processed = 0;
  for (const activity of due) {
    const path = activity.opportunityId
      ? `oportunidades/${activity.opportunityId}`
      : `leads/${activity.leadId}`;
    const link = `${deps.crmBaseUrl}/${path}`;
    const sent = await deps.mailer.send({
      from: deps.systemSender,
      to: [activity.ownerEmail],
      subject: `Recordatorio: ${activity.subject}`,
      html: `<p>Tienes pendiente: <strong>${escapeHtml(activity.subject)}</strong>.</p><p><a href="${escapeHtml(link)}">Abrir en el CRM</a></p>`,
    });
    if (!sent.ok) continue;
    await db.update(activities).set({ remindedAt: now }).where(eq(activities.id, activity.id));
    processed++;
  }
  return ok({ processed });
}

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "long" });

export async function quoteExpirySweep(db: DbOrTx, deps: SweepDeps, now: Date): Promise<Processed> {
  const today = limaDate(now);
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * DAY_MS).toISOString().slice(0, 10);
  const sent = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      version: quotes.version,
      validUntil: quotes.validUntil,
      expiryAlertedAt: quotes.expiryAlertedAt,
      ownerEmail: users.email,
    })
    .from(quotes)
    .innerJoin(users, eq(quotes.ownerId, users.id))
    .where(eq(quotes.status, "enviada"));
  let processed = 0;
  for (const quote of sent) {
    if (!quote.validUntil) continue;
    if (quote.validUntil < today) {
      await db.transaction(async (tx) => {
        await tx.update(quotes).set({ status: "vencida" }).where(eq(quotes.id, quote.id));
        await writeAudit(tx, {
          actorId: null,
          action: "quote.expired",
          targetType: "quote",
          targetId: quote.id,
          metadata: { validUntil: quote.validUntil },
        });
      });
      processed++;
    } else if (quote.validUntil <= soon && !quote.expiryAlertedAt) {
      const date = dayFormat.format(new Date(`${quote.validUntil}T00:00:00Z`));
      const link = `${deps.crmBaseUrl}/cotizaciones/${quote.id}`;
      const mail = await deps.mailer.send({
        from: deps.systemSender,
        to: [quote.ownerEmail],
        subject: `Cotización ${quote.number} v${quote.version} vence el ${date}`,
        html: `<p>La cotización ${escapeHtml(quote.number)} v${quote.version} vence el ${escapeHtml(date)}. Haz seguimiento con el cliente.</p><p><a href="${escapeHtml(link)}">Abrir la cotización</a></p>`,
      });
      if (!mail.ok) continue;
      await db.update(quotes).set({ expiryAlertedAt: now }).where(eq(quotes.id, quote.id));
      processed++;
    }
  }
  return ok({ processed });
}

export async function flushOutbox(
  db: DbOrTx,
  deps: { send: (event: { name: string; data: unknown }) => Promise<unknown> },
  now: Date,
): Promise<Processed> {
  const pending = await db
    .select()
    .from(outbox)
    .where(and(isNull(outbox.sentAt), lt(outbox.attempts, 10)))
    .orderBy(asc(outbox.createdAt))
    .limit(100);
  let processed = 0;
  for (const row of pending) {
    try {
      await deps.send({ name: row.eventName, data: row.payload });
      await db.update(outbox).set({ sentAt: now, lastError: null }).where(eq(outbox.id, row.id));
      processed++;
    } catch (error) {
      await db
        .update(outbox)
        .set({ attempts: row.attempts + 1, lastError: String((error as Error)?.message ?? error) })
        .where(eq(outbox.id, row.id));
    }
  }
  return ok({ processed });
}

// Deactivates CRM users whose Microsoft 365 account was disabled or deleted. A Graph error leaves
// everyone as they are.
export async function entraSync(
  db: DbOrTx,
  deps: { mailer: Mailer },
  _now: Date,
): Promise<Processed> {
  const active = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.isActive, true), not(like(users.email, "%@e2e.tekinsof.test"))));
  let processed = 0;
  for (const user of active) {
    const enabled = await deps.mailer.getAccountEnabled(user.email);
    if (!enabled.ok || enabled.data === true) continue;
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await writeAudit(tx, {
        actorId: null,
        action: "user.deactivated",
        targetType: "user",
        targetId: user.id,
        metadata: { reason: "entra" },
      });
    });
    processed++;
  }
  return ok({ processed });
}

// Call inside the transaction that publishes the content, so the request and its event commit together.
export async function requestSitePublish(
  tx: DbOrTx,
  input: { requestedBy: string | null; reason: string },
): Promise<string> {
  const [row] = await tx
    .insert(sitePublishes)
    .values({ requestedBy: input.requestedBy, reason: input.reason })
    .returning({ id: sitePublishes.id });
  if (!row) throw new Error("requestSitePublish: insert returned no row");
  await tx.insert(outbox).values({
    eventName: "site/publish.requested",
    payload: { sitePublishId: row.id },
  });
  return row.id;
}

export async function triggerSiteDeploy(
  db: DbOrTx,
  deps: { hookUrl?: string; fetchImpl?: typeof fetch },
  sitePublishId: string,
): Promise<Result<{ status: "disparado" | "error" }>> {
  const fail = async (message: string) => {
    await db
      .update(sitePublishes)
      .set({ status: "error", error: message })
      .where(eq(sitePublishes.id, sitePublishId));
    return ok({ status: "error" as const });
  };
  if (!deps.hookUrl) return fail("VERCEL_DEPLOY_HOOK_URL no configurado");
  try {
    const res = await (deps.fetchImpl ?? fetch)(deps.hookUrl, { method: "POST" });
    if (!res.ok) return fail(`Deploy hook ${res.status}`);
  } catch (error) {
    return fail(`Deploy hook: ${(error as Error).message}`);
  }
  await db
    .update(sitePublishes)
    .set({ status: "disparado", triggeredAt: new Date(), error: null })
    .where(eq(sitePublishes.id, sitePublishId));
  return ok({ status: "disparado" });
}

export async function notifyApprovalRequested(
  db: DbOrTx,
  deps: SweepDeps,
  quoteId: string,
): Promise<Processed> {
  const [quote] = await db
    .select({ number: quotes.number, version: quotes.version, discountPct: quotes.discountPct })
    .from(quotes)
    .where(eq(quotes.id, quoteId));
  if (!quote) return err("NOT_FOUND", "Cotización no encontrada");
  const managers = (await activeManagers(db)).map((m) => m.email);
  const link = `${deps.crmBaseUrl}/cotizaciones/${quoteId}`;
  const subject = `Aprobación pendiente: ${quote.number} v${quote.version} (${quote.discountPct}% de descuento)`;
  const html = `<p>${escapeHtml(subject)}</p><p><a href="${escapeHtml(link)}">Revisar y aprobar</a></p>`;
  return ok({ processed: await mailAll(deps, managers, subject, html) });
}
