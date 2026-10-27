import { can } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import { activityTypes, addActivity, completeActivity } from "@tekinsof/core/leads/activities";
import { changeLeadStatus, getLead } from "@tekinsof/core/leads/leads";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Lead" };

const sourceLabels: Record<string, string> = {
  web_form: "Formulario web",
  landing: "Landing",
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Manual",
  event: "Evento",
  other: "Otro",
};
const statusLabels: Record<string, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  calificado: "Calificado",
  descartado: "Descartado",
  convertido: "Convertido",
};
// Next states offered in the form (blueprint §5); `convertido` comes from convertLead in step 13.
const nextStatuses: Record<string, string[]> = {
  nuevo: ["contactado", "descartado"],
  contactado: ["calificado", "descartado"],
  calificado: ["descartado"],
  descartado: ["nuevo"],
  convertido: [],
};
const activityLabels: Record<string, string> = {
  llamada: "Llamada",
  reunion: "Reunión",
  correo: "Correo",
  whatsapp: "WhatsApp",
  tarea: "Tarea",
  nota: "Nota",
};
const dateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
});

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | undefined>>;

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function back(id: string, params: Record<string, string>): never {
  redirect(`/leads/${id}?${new URLSearchParams(params).toString()}`);
}

function failure(id: string, error: { message: string; fields?: Record<string, string> }): never {
  const params: Record<string, string> = { error: error.message };
  for (const [field, message] of Object.entries(error.fields ?? {})) params[`e_${field}`] = message;
  back(id, params);
}

async function changeStatus(formData: FormData) {
  "use server";
  const leadId = str(formData, "leadId");
  const actor = await authorize("leads.read");
  if (!actor.ok) failure(leadId, actor.error);
  const to = str(formData, "to") as Parameters<typeof changeLeadStatus>[2]["to"];
  const result = await changeLeadStatus(getDb(), actor.data, {
    leadId,
    to,
    reason: str(formData, "reason"),
  });
  if (!result.ok) failure(leadId, result.error);
  back(leadId, { ok: "Estado actualizado" });
}

async function logActivity(formData: FormData) {
  "use server";
  const leadId = str(formData, "leadId");
  const actor = await authorize("leads.read");
  if (!actor.ok) failure(leadId, actor.error);
  const due = str(formData, "dueAt");
  const result = await addActivity(getDb(), actor.data, {
    leadId,
    type: str(formData, "type") as (typeof activityTypes)[number],
    subject: str(formData, "subject"),
    notes: str(formData, "notes"),
    // <input type="datetime-local"> has no zone: it is Lima wall time (UTC−05:00, no DST).
    dueAt: due ? `${due}:00-05:00` : undefined,
  });
  if (!result.ok) failure(leadId, result.error);
  back(leadId, { ok: "Actividad registrada" });
}

async function finishActivity(formData: FormData) {
  "use server";
  const leadId = str(formData, "leadId");
  const actor = await authorize("leads.read");
  if (!actor.ok) failure(leadId, actor.error);
  const result = await completeActivity(getDb(), actor.data, str(formData, "activityId"));
  if (!result.ok) failure(leadId, result.error);
  back(leadId, { ok: "Actividad completada" });
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{term}</dt>
      <dd className="font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermissionPage("leads.read");
  const { id } = await params;
  const query = await searchParams;
  const lead = await getLead(getDb(), id);
  if (!lead) notFound();
  const canEdit = can(actor, "leads.update_own", { ownerId: lead.ownerId });
  const options = (nextStatuses[lead.status] ?? []).filter(
    (status) => status !== "nuevo" || can(actor, "leads.update_any"),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">{lead.fullName}</h1>
        <Badge tone={lead.status === "descartado" ? "danger" : "accent"}>
          {statusLabels[lead.status] ?? lead.status}
        </Badge>
        {lead.slaAlertedAt && !lead.firstContactedAt ? (
          <Badge tone="danger">SLA vencido</Badge>
        ) : null}
      </div>
      <div aria-live="polite">
        {query.ok ? (
          <p role="status" className="text-sm text-success">
            {query.ok}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Datos">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item term="Teléfono">{lead.phone}</Item>
            <Item term="Correo">{lead.email}</Item>
            <Item term="Empresa">{lead.companyName}</Item>
            <Item term="Servicio de interés">{lead.serviceInterest}</Item>
            <Item term="Origen">{sourceLabels[lead.source] ?? lead.source}</Item>
            <Item term="Dueño">{lead.ownerName ?? "Sin asignar"}</Item>
            <Item term="Recibido">{dateTime.format(lead.createdAt)}</Item>
            <Item term="Primer contacto">
              {lead.firstContactedAt ? dateTime.format(lead.firstContactedAt) : null}
            </Item>
          </dl>
          {lead.message ? <p className="mt-4 whitespace-pre-line">{lead.message}</p> : null}
          {lead.discardReason ? (
            <p className="mt-4 text-fg-muted">Motivo de descarte: {lead.discardReason}</p>
          ) : null}
        </Card>
        <Card title="Atribución">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item term="Campaña">{lead.campaignName ?? lead.utmCampaign}</Item>
            <Item term="Landing">{lead.landingSlug}</Item>
            <Item term="utm_source">{lead.utmSource}</Item>
            <Item term="utm_medium">{lead.utmMedium}</Item>
            <Item term="utm_term">{lead.utmTerm}</Item>
            <Item term="utm_content">{lead.utmContent}</Item>
            <Item term="Referrer">{lead.referrer}</Item>
            <Item term="Consentimiento">{lead.consentVersion}</Item>
          </dl>
        </Card>
      </div>

      {canEdit && options.length > 0 ? (
        <Card title="Cambiar estado">
          <form action={changeStatus} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <Field id="to" label="Nuevo estado" error={query.e_to}>
              <Select name="to">
                {options.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="reason"
              label="Motivo"
              help="Obligatorio para descartar"
              error={query.e_reason}
            >
              <Input name="reason" />
            </Field>
            <div>
              <Button type="submit">Guardar estado</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {canEdit ? (
        <Card title="Registrar actividad">
          <form action={logActivity} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <Field id="type" label="Tipo" error={query.e_type}>
              <Select name="type" defaultValue="llamada">
                {activityTypes.map((type) => (
                  <option key={type} value={type}>
                    {activityLabels[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="subject" label="Asunto" error={query.e_subject}>
              <Input name="subject" required />
            </Field>
            <Field id="dueAt" label="Vence (opcional)" error={query.e_dueAt}>
              <Input name="dueAt" type="datetime-local" />
            </Field>
            <Field id="notes" label="Notas">
              <Textarea name="notes" />
            </Field>
            <div>
              <Button type="submit">Registrar actividad</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Actividades">
        {lead.activities.length === 0 ? (
          <EmptyState title="Sin actividades" text="Registra la primera llamada o mensaje." />
        ) : (
          <ol className="space-y-4">
            {lead.activities.map((activity) => (
              <li key={activity.id} className="border-l-2 border-border pl-4">
                <p className="font-medium">
                  {activityLabels[activity.type] ?? activity.type} · {activity.subject}
                </p>
                <p className="text-sm text-fg-muted">
                  {dateTime.format(activity.createdAt)}
                  {activity.dueAt ? ` · vence ${dateTime.format(activity.dueAt)}` : ""}
                  {activity.doneAt ? " · completada" : ""}
                </p>
                {activity.notes ? (
                  <p className="mt-1 whitespace-pre-line">{activity.notes}</p>
                ) : null}
                {canEdit && !activity.doneAt && activity.dueAt ? (
                  <form action={finishActivity} className="mt-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="activityId" value={activity.id} />
                    <Button type="submit" variant="ghost">
                      Completar
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
