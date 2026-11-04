import type { AdFormRow } from "@tekinsof/core/integrations/ad-forms";
import { Badge, Button, EmptyState, Select, Table } from "@/components/ui";
import { formatCount, formatDate } from "./format";

type Props = {
  forms: AdFormRow[];
  campaigns: { id: string; name: string }[];
  mapAction: (formData: FormData) => Promise<void>;
  emptyText: string;
};

// Forms of one provider, each with its campaign; a form without one is "Sin mapear".
export function AdFormsTable({ forms, campaigns, mapAction, emptyText }: Props) {
  if (forms.length === 0) return <EmptyState title="Sin formularios" text={emptyText} />;
  return (
    <Table<AdFormRow>
      caption="Formularios de anuncios"
      rows={forms}
      rowKey={(row) => row.id}
      columns={[
        {
          key: "name",
          label: "Formulario",
          render: (row) => (
            <span>
              <span className="block font-medium">{row.name}</span>
              <span className="block text-xs break-all text-fg-muted">{row.externalFormId}</span>
            </span>
          ),
        },
        {
          key: "campaign",
          label: "Campaña",
          render: (row) => (
            <form action={mapAction} className="flex items-center gap-2">
              <input type="hidden" name="adFormId" value={row.id} />
              <label htmlFor={`campaign-${row.id}`} className="sr-only">
                Campaña de {row.name}
              </label>
              <Select
                id={`campaign-${row.id}`}
                name="campaignId"
                defaultValue={row.campaignId ?? ""}
              >
                <option value="">Sin campaña</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="ghost">
                Guardar
              </Button>
            </form>
          ),
        },
        {
          key: "state",
          label: "Estado",
          render: (row) =>
            row.campaignId ? (
              <Badge tone="success">Mapeado</Badge>
            ) : (
              <Badge tone="warning">Sin mapear</Badge>
            ),
        },
        {
          key: "leads",
          label: "Leads",
          numeric: true,
          render: (row) => formatCount(row.leadCount),
        },
        { key: "createdAt", label: "Registrado", render: (row) => formatDate(row.createdAt) },
      ]}
    />
  );
}
