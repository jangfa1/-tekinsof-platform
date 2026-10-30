import { type InboundLogRow, inboundStatuses } from "@tekinsof/core/integrations/testing";
import { ExternalLink } from "lucide-react";
import { sendTestLeadAction } from "@/app/(app)/configuracion/integraciones/actions";
import { Badge, Button, Card, EmptyState, Field, Select, Table } from "@/components/ui";
import { CopyField } from "./copy-button";
import { formatDateTime, formatSince } from "./format";
import { INTEGRATIONS_PATH } from "./page-header";
import { TestLeadForm } from "./test-lead-form";

export type WebhookCheck = {
  provider: "meta" | "google_ads" | "tiktok";
  name: string;
  url: string;
  checks: { label: string; ok: boolean }[];
  lastEventAt: Date | null;
};

export const providerLabels: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google",
  tiktok: "TikTok",
};

const statusTones = {
  procesado: "success",
  recibido: "neutral",
  ignorado: "warning",
  error: "danger",
} as const;

type Props = {
  checks: WebhookCheck[];
  events: InboundLogRow[];
  googleForms: { id: string; name: string }[];
  filters: { provider?: string; status?: string };
  now: Date;
};

const columns = [
  {
    key: "receivedAt",
    label: "Recibido",
    render: (row: InboundLogRow) => formatDateTime(row.receivedAt),
  },
  {
    key: "provider",
    label: "Proveedor",
    render: (row: InboundLogRow) => providerLabels[row.provider] ?? row.provider,
  },
  {
    key: "externalId",
    label: "ID externo",
    render: (row: InboundLogRow) => <code className="break-all">{row.externalId}</code>,
  },
  {
    key: "signature",
    label: "Firma",
    render: (row: InboundLogRow) => (row.signatureValid ? "Válida" : "Inválida"),
  },
  {
    key: "status",
    label: "Estado",
    render: (row: InboundLogRow) => (
      <Badge tone={statusTones[row.status as keyof typeof statusTones] ?? "neutral"}>
        {row.status}
      </Badge>
    ),
  },
  {
    key: "attempts",
    label: "Intentos",
    numeric: true,
    render: (row: InboundLogRow) => row.attempts,
  },
  { key: "error", label: "Detalle", render: (row: InboundLogRow) => row.error ?? "—" },
];

export function TestPanel({ checks, events, googleForms, filters, now }: Props) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="checklist" className="space-y-4">
        <h2 id="checklist" className="font-display text-xl font-semibold">
          Verificación de webhooks
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {checks.map((check) => (
            <article
              key={check.provider}
              aria-labelledby={`check-${check.provider}`}
              className="min-w-0 space-y-4 rounded-[var(--radius-card)] border border-border bg-background p-5"
            >
              <h3 id={`check-${check.provider}`} className="font-display font-semibold">
                {check.name}
              </h3>
              <CopyField value={check.url} label="Copiar URL" />
              <ul className="space-y-2 text-sm">
                {check.checks.map((item) => (
                  <li key={item.label} className="flex items-center gap-2">
                    <Badge tone={item.ok ? "success" : "danger"}>
                      {item.ok ? "Listo" : "Falta"}
                    </Badge>
                    {item.label}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-fg-muted">
                Último evento:{" "}
                <span className="text-fg">{formatSince(check.lastEventAt, now)}</span>
              </p>
            </article>
          ))}
        </div>
      </section>

      <Card title="Enviar lead de prueba">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            El lead recorre el mismo camino que uno real (verificación, registro y procesamiento) y
            queda marcado como prueba: no se asigna a nadie ni suma en las métricas.
          </p>
          <TestLeadForm action={sendTestLeadAction} googleForms={googleForms} />
          <p className="text-sm text-fg-muted">
            Facebook e Instagram se prueban con la{" "}
            <a
              href="https://developers.facebook.com/tools/lead-ads-testing"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-link underline"
            >
              herramienta de prueba de Meta
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
            ; el resultado aparece en el registro de eventos.
          </p>
        </div>
      </Card>

      <section aria-labelledby="event-log" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="event-log" className="font-display text-xl font-semibold">
              Registro de eventos
            </h2>
            <p className="text-sm text-fg-muted">
              Los últimos 50 webhooks. El contenido del lead no se muestra aquí.
            </p>
          </div>
          <form action={INTEGRATIONS_PATH} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="pruebas" />
            <Field id="log-provider" label="Proveedor">
              <Select name="proveedor" defaultValue={filters.provider ?? ""}>
                <option value="">Todos</option>
                {Object.entries(providerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="log-status" label="Estado">
              <Select name="estado" defaultValue={filters.status ?? ""}>
                <option value="">Todos</option>
                {inboundStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="ghost">
              Filtrar
            </Button>
          </form>
        </div>
        {events.length === 0 ? (
          <EmptyState
            title="Sin eventos"
            text="Cuando una plataforma envíe un lead, lo verás aquí con su resultado."
          />
        ) : (
          <Table<InboundLogRow>
            caption="Registro de eventos de webhooks"
            rows={events}
            rowKey={(row) => row.id}
            columns={columns}
          />
        )}
      </section>
    </div>
  );
}
