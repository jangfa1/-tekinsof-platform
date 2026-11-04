import type { AccountRow } from "@tekinsof/core/integrations/accounts";
import { Badge, Button, Card, EmptyState, Field, Input, Table } from "@/components/ui";
import { formatDate, formatSince } from "./format";

const accountStatus: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  conectada: { label: "Conectada", tone: "success" },
  expirada: { label: "Token vencido", tone: "danger" },
  error: { label: "Error", tone: "danger" },
  revocada: { label: "Desconectada", tone: "warning" },
};

type Props = {
  accounts: AccountRow[];
  connectAction: (formData: FormData) => Promise<void>;
  disconnectAction: (formData: FormData) => Promise<void>;
  fieldErrors: Record<string, string | undefined>;
  values: { pageId?: string; displayName?: string };
  now: Date;
};

export function MetaSettings({
  accounts,
  connectAction,
  disconnectAction,
  fieldErrors,
  values,
  now,
}: Props) {
  return (
    <div className="space-y-8">
      <Card title="Conectar una Página de Facebook">
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-6 text-sm text-fg-muted">
            <li>En Business Manager, crea un usuario del sistema con acceso a la Página.</li>
            <li>Genera su token con los permisos leads_retrieval y pages_manage_metadata.</li>
            <li>Pega aquí el ID de la Página y el token. Lo guardamos cifrado.</li>
          </ol>
          <form action={connectAction} className="grid gap-4 md:grid-cols-2">
            <Field id="meta-page-id" label="ID de la Página" error={fieldErrors.pageId}>
              <Input
                name="pageId"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={values.pageId}
              />
            </Field>
            <Field id="meta-name" label="Nombre de la Página" error={fieldErrors.displayName}>
              <Input
                name="displayName"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={values.displayName}
              />
            </Field>
            <div className="md:col-span-2">
              <Field
                id="meta-token"
                label="Token del usuario del sistema"
                help="No se vuelve a mostrar después de guardarlo."
                error={fieldErrors.pageToken}
              >
                <Input name="pageToken" type="password" required autoComplete="off" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Conectar Página</Button>
            </div>
          </form>
        </div>
      </Card>

      <section aria-labelledby="meta-accounts" className="space-y-4">
        <h2 id="meta-accounts" className="font-display text-xl font-semibold">
          Páginas conectadas
        </h2>
        {accounts.length === 0 ? (
          <EmptyState
            title="Ninguna Página conectada"
            text="Conecta tu Página para empezar a recibir leads de Facebook e Instagram."
          />
        ) : (
          <Table<AccountRow>
            caption="Páginas de Facebook conectadas"
            rows={accounts}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                label: "Página",
                render: (row) => (
                  <span>
                    <span className="block font-medium">{row.displayName}</span>
                    <span className="block text-xs text-fg-muted">{row.externalAccountId}</span>
                  </span>
                ),
              },
              {
                key: "status",
                label: "Estado",
                render: (row) => {
                  const s = accountStatus[row.status] ?? accountStatus.error;
                  return <Badge tone={s?.tone}>{s?.label}</Badge>;
                },
              },
              { key: "since", label: "Conectada", render: (row) => formatDate(row.connectedAt) },
              { key: "by", label: "Responsable", render: (row) => row.connectedByName ?? "—" },
              {
                key: "sync",
                label: "Último lead",
                render: (row) => formatSince(row.lastOkAt, now),
              },
              {
                key: "actions",
                label: "Acciones",
                render: (row) =>
                  row.status === "revocada" ? (
                    <span className="text-sm text-fg-muted">Reconecta con un token nuevo</span>
                  ) : (
                    <details>
                      <summary className="min-h-9 cursor-pointer py-2 text-sm font-medium">
                        Desconectar
                      </summary>
                      <form action={disconnectAction} className="mt-2 space-y-2">
                        <input type="hidden" name="accountId" value={row.id} />
                        <p className="text-sm text-fg-muted">
                          Dejarás de recibir leads de esta Página.
                        </p>
                        <Button type="submit" variant="danger">
                          Confirmar desconexión
                        </Button>
                      </form>
                    </details>
                  ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
