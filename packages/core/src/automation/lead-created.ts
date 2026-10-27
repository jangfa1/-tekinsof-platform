import { and, asc, eq, sql } from "drizzle-orm";
import { writeAudit } from "../audit/audit.ts";
import type { DbOrTx } from "../db/client.ts";
import { campaigns, leads, users } from "../db/schema.ts";
import { escapeHtml, type Mailer } from "../integrations/graph.ts";
import { err, ok, type Result } from "../result.ts";

export type LeadCreatedDeps = {
  mailer: Mailer;
  systemSender: string;
  crmBaseUrl: string;
  now: () => Date;
};

type Owner = { id: string; name: string; email: string; role: string };

const sourceLabels: Record<string, string> = {
  web_form: "Formulario web",
  landing: "Landing",
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Manual",
  event: "Evento",
  other: "Otro",
};

// Picks the next owner by rotation: the active seller who received a lead longest ago (never
// first); with no seller available, the first active Gerencia user.
async function pickOwner(tx: DbOrTx): Promise<Owner | undefined> {
  const columns = { id: users.id, name: users.name, email: users.email, role: users.role };
  const [seller] = await tx
    .select(columns)
    .from(users)
    .where(and(eq(users.role, "ventas"), eq(users.isActive, true), eq(users.receivesLeads, true)))
    .orderBy(sql`${users.lastAssignedAt} asc nulls first`, asc(users.id))
    .limit(1)
    .for("update");
  if (seller) return seller;
  const [manager] = await tx
    .select(columns)
    .from(users)
    .where(and(eq(users.role, "gerencia"), eq(users.isActive, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return manager;
}

export async function handleLeadCreated(
  db: DbOrTx,
  deps: LeadCreatedDeps,
  leadId: string,
): Promise<Result<{ ownerId: string | null; notified: boolean; acknowledged: boolean }>> {
  const now = deps.now();
  const assigned = await db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id, ownerId: leads.ownerId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .for("update");
    if (!lead) return err("NOT_FOUND", "Lead no encontrado");
    // Idempotent: an owned lead (already processed, or registered by its seller) is left alone.
    if (lead.ownerId) return ok({ owner: null, ownerId: lead.ownerId });
    const owner = await pickOwner(tx);
    if (!owner) return ok({ owner: null, ownerId: null });
    await tx.update(leads).set({ ownerId: owner.id, assignedAt: now }).where(eq(leads.id, leadId));
    await tx.update(users).set({ lastAssignedAt: now }).where(eq(users.id, owner.id));
    await writeAudit(tx, {
      actorId: null,
      action: "lead.assigned",
      targetType: "lead",
      targetId: leadId,
      metadata: { ownerId: owner.id, rule: owner.role === "ventas" ? "rotation" : "fallback" },
    });
    return ok({ owner, ownerId: owner.id });
  });
  if (!assigned.ok) return assigned;
  const { owner, ownerId } = assigned.data;
  if (!owner) return ok({ ownerId, notified: false, acknowledged: false });

  const [lead] = await db
    .select({
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      serviceInterest: leads.serviceInterest,
      utmCampaign: leads.utmCampaign,
      campaignName: campaigns.name,
    })
    .from(leads)
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(eq(leads.id, leadId));
  if (!lead) return ok({ ownerId, notified: false, acknowledged: false });

  const link = `${deps.crmBaseUrl}/leads/${leadId}`;
  const campaign = lead.campaignName ?? lead.utmCampaign ?? "—";
  // A mail failure never undoes the assignment; the caller reports it through the flags.
  const notice = await deps.mailer.send({
    from: deps.systemSender,
    to: [owner.email],
    subject: `Nuevo lead: ${lead.fullName}`,
    html: [
      `<p>Hola ${escapeHtml(owner.name)}, se te asignó un nuevo lead.</p>`,
      `<p><strong>${escapeHtml(lead.fullName)}</strong><br>`,
      `Correo: ${escapeHtml(lead.email ?? "—")}<br>Teléfono: ${escapeHtml(lead.phone ?? "—")}<br>`,
      `Origen: ${escapeHtml(sourceLabels[lead.source] ?? lead.source)}<br>`,
      `Campaña: ${escapeHtml(campaign)}<br>Servicio: ${escapeHtml(lead.serviceInterest ?? "—")}</p>`,
      `<p><a href="${escapeHtml(link)}">Abrir el lead en el CRM</a></p>`,
      "<p>Recuerda: el primer contacto debe darse en menos de 4 horas laborables.</p>",
    ].join(""),
  });

  let acknowledged = false;
  if (lead.email && (lead.source === "web_form" || lead.source === "landing")) {
    const ack = await deps.mailer.send({
      from: owner.role === "ventas" ? owner.email : deps.systemSender,
      to: [lead.email],
      replyTo: owner.email,
      subject: "Recibimos tu consulta — Tekinsof",
      html: [
        `<p>Hola ${escapeHtml(lead.fullName)}:</p>`,
        "<p>Gracias por escribirnos. Recibimos tu consulta y te contactaremos en menos de 4 horas laborables.</p>",
        "<p>Si prefieres, escríbenos por WhatsApp al +51 981 053 022.</p>",
        `<p>Saludos,<br>${escapeHtml(owner.name)}<br>Tekinsof Consulting</p>`,
      ].join(""),
    });
    acknowledged = ack.ok;
  }
  return ok({ ownerId, notified: notice.ok, acknowledged });
}
