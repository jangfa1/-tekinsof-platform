import { can } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import { activityTypes, addActivity, completeActivity } from "@tekinsof/core/leads/activities";
import { closeOpportunity, getOpportunity } from "@tekinsof/core/sales/opportunities";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Oportunidad" };

const stageLabels: Record<string, string> = {
  calificacion: "Calificación",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganada: "Ganada",
  perdida: "Perdida",
};
const quoteStatusLabels: Record<string, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobación",
  aprobada: "Aprobada",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
  reemplazada: "Reemplazada",
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
const amount = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2 });
const money = (cents: number, currency: string) =>
  `${currency === "USD" ? "US$" : "S/"} ${amount.format(cents / 100)}`;

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | undefined>>;

const str = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function back(id: string, params: Record<string, string>): never {
  redirect(`/oportunidades/${id}?${new URLSearchParams(params).toString()}`);
}

function failure(id: string, error: { message: string; fields?: Record<string, string> }): never {
  const params: Record<string, string> = { error: error.message };
  for (const [field, message] of Object.entries(error.fields ?? {})) params[`e_${field}`] = message;
  back(id, params);
}

async function close(formData: FormData) {
  "use server";
  const id = str(formData, "opportunityId");
  const actor = await authorize("opportunities.read");
  if (!actor.ok) failure(id, actor.error);
  const result = await closeOpportunity(getDb(), actor.data, {
    opportunityId: id,
    outcome: str(formData, "outcome") as "ganada" | "perdida",
    lostReason: str(formData, "lostReason"),
  });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: result.data.stage === "ganada" ? "¡Oportunidad ganada!" : "Oportunidad cerrada" });
}

async function logActivity(formData: FormData) {
  "use server";
  const id = str(formData, "opportunityId");
  const actor = await authorize("opportunities.read");
  if (!actor.ok) failure(id, actor.error);
  const due = str(formData, "dueAt");
  const result = await addActivity(getDb(), actor.data, {
    opportunityId: id,
    type: str(formData, "type") as (typeof activityTypes)[number],
    subject: str(formData, "subject"),
    notes: str(formData, "notes"),
    // <input type="datetime-local"> has no zone: it is Lima wall time (UTC−05:00, no DST).
    dueAt: due ? `${due}:00-05:00` : undefined,
  });
  if (!result.ok) failure(id, result.error);
  back(id, { ok: "Actividad registrada" });
}

async function finishActivity(formData: FormData) {
  "use server";
  const id = str(formData, "opportunityId");
  const actor = await authorize("opportunities.read");
  if (!actor.ok) failure(id, actor.error);
  const result = await completeActivity(getDb(), actor.data, str(formData, "activityId"));
  if (!result.ok) failure(id, result.error);
  back(id, { ok: "Actividad completada" });
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{term}</dt>
      <dd className="font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermissionPage("opportunities.read");
  const { id } = await params;
  const query = await searchParams;
  const opportunity = await getOpportunity(getDb(), id);
  if (!opportunity) notFound();
  const canEdit = can(actor, "opportunities.write_own", { ownerId: opportunity.ownerId });
  const open = !["ganada", "perdida"].includes(opportunity.stage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">{opportunity.title}</h1>
        <Badge
          tone={
            opportunity.stage === "ganada"
              ? "success"
              : opportunity.stage === "perdida"
                ? "danger"
                : "accent"
          }
        >
          {stageLabels[opportunity.stage] ?? opportunity.stage}
        </Badge>
      </div>
      <p
        aria-live="polite"
        role={query.error ? "alert" : "status"}
        className={`text-sm ${query.error ? "text-destructive" : "text-success"}`}
      >
        {query.error ?? query.ok}
      </p>

      <Card title="Datos">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Item term="Monto">
            <span className="tabular-nums">
              {money(opportunity.amountCents, opportunity.currency)}
            </span>
          </Item>
          <Item term="Empresa">
            {opportunity.companyId ? (
              <Link href={`/empresas/${opportunity.companyId}`} className="text-link">
                {opportunity.companyName}
              </Link>
            ) : null}
          </Item>
          <Item term="Contacto">
            {opportunity.contact
              ? [opportunity.contact.fullName, opportunity.contact.phone, opportunity.contact.email]
                  .filter(Boolean)
                  .join(" · ")
              : null}
          </Item>
          <Item term="Dueño">{opportunity.ownerName}</Item>
          <Item term="Cierre esperado">{opportunity.expectedCloseOn}</Item>
          <Item term="Lead de origen">
            {opportunity.leadId ? (
              <Link href={`/leads/${opportunity.leadId}`} className="text-link">
                Ver lead
              </Link>
            ) : null}
          </Item>
        </dl>
        {opportunity.lostReason ? (
          <p className="mt-4 text-fg-muted">Motivo de pérdida: {opportunity.lostReason}</p>
        ) : null}
      </Card>

      {canEdit && open ? (
        <Card title="Cerrar oportunidad">
          <form action={close} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <Field id="outcome" label="Resultado">
              <Select name="outcome" defaultValue="ganada">
                <option value="ganada">Ganada</option>
                <option value="perdida">Perdida</option>
              </Select>
            </Field>
            <Field
              id="lostReason"
              label="Motivo"
              help="Obligatorio si se pierde"
              error={query.e_lostReason}
            >
              <Input name="lostReason" />
            </Field>
            <div>
              <Button type="submit">Cerrar oportunidad</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Cotizaciones">
        {opportunity.quotes.length === 0 ? (
          <EmptyState
            title="Sin cotizaciones"
            text="Las cotizaciones de esta oportunidad aparecerán aquí."
          />
        ) : (
          <ul className="space-y-2">
            {opportunity.quotes.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/cotizaciones/${quote.id}`} className="font-medium text-link">
                  {quote.number} v{quote.version}
                </Link>
                <Badge>{quoteStatusLabels[quote.status] ?? quote.status}</Badge>
                <span className="tabular-nums">{money(quote.totalCents, quote.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canEdit ? (
        <Card title="Registrar actividad">
          <form action={logActivity} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <Field id="type" label="Tipo">
              <Select name="type" defaultValue="reunion">
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
            <Field id="dueAt" label="Vence (opcional)">
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
        {opportunity.activities.length === 0 ? (
          <EmptyState title="Sin actividades" text="Registra reuniones, llamadas y tareas." />
        ) : (
          <ol className="space-y-4">
            {opportunity.activities.map((activity) => (
              <li key={activity.id} className="border-l-2 border-border pl-4">
                <p className="font-medium">
                  {activityLabels[activity.type] ?? activity.type} · {activity.subject}
                </p>
                <p className="text-sm text-fg-muted">
                  {dateTime.format(activity.createdAt)} · {activity.ownerName}
                  {activity.dueAt ? ` · vence ${dateTime.format(activity.dueAt)}` : ""}
                  {activity.doneAt ? " · completada" : ""}
                </p>
                {activity.notes ? (
                  <p className="mt-1 whitespace-pre-line">{activity.notes}</p>
                ) : null}
                {canEdit && !activity.doneAt && activity.dueAt ? (
                  <form action={finishActivity} className="mt-2">
                    <input type="hidden" name="opportunityId" value={opportunity.id} />
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
