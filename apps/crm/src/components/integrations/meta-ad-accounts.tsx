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
  values: { adAccountId?: string; displayName?: string };
  now: Date;
};

// The Meta ad account (`act_…`) whose daily spend the `spend-sync` cron reads at 06:00 Lima.
export function MetaAdAccounts({
  accounts,
  connectAction,
  disconnectAction,
  fieldErrors,
  values,
  now,
}: Props) {
  return (
    <div className="space-y-8">
      <Card title="Cuenta publicitaria (gasto)">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Cada día a las 06:00 el CRM trae el gasto de los últimos 3 días de cada campaña,
            separado en Facebook e Instagram, para calcular el costo por lead.
          </p>
          <ol className="list-decimal space-y-1 pl-6 text-sm text-fg-muted">
            <li>En Business Manager, da al usuario del sistema acceso a la cuenta publicitaria.</li>
            <li>Genera su token con el permiso ads_read.</li>
            <li>Revisa que la zona horaria de la cuenta sea America/Lima.</li>
          </ol>
          <form action={connectAction} className="grid gap-4 md:grid-cols-2">
            <Field
              id="meta-ad-account-id"
              label="ID de la cuenta publicitaria"
              help="Con o sin el prefijo act_."
              error={fieldErrors.adAccountId}
            >
              <Input
                name="adAccountId"
                required
                autoComplete="off"
                defaultValue={values.adAccountId}
              />
            </Field>
            <Field
              id="meta-ad-account-name"
              label="Nombre de la cuenta publicitaria"
              error={fieldErrors.displayName}
            >
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
                id="meta-ad-account-token"
                label="Token con permiso ads_read"
                help="No se vuelve a mostrar después de guardarlo."
                error={fieldErrors.token}
              >
                <Input name="token" type="password" required autoComplete="off" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Conectar cuenta publicitaria</Button>
            </div>
          </form>
        </div>
      </Card>

      <section aria-labelledby="meta-ad-accounts" className="space-y-4">
        <h2 id="meta-ad-accounts" className="font-display text-xl font-semibold">
          Cuentas publicitarias conectadas
        </h2>
        {accounts.length === 0 ? (
          <EmptyState
            title="Ninguna cuenta publicitaria conectada"
            text="Sin ella, el gasto de Meta se registra a mano desde Campañas."
          />
        ) : (
          <Table<AccountRow>
            caption="Cuentas publicitarias de Meta conectadas"
            rows={accounts}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                label: "Cuenta",
                render: (row) => (
                  <span>
                    <span className="block font-medium">{row.displayName}</span>
                    <span className="block text-xs text-fg-muted">act_{row.externalAccountId}</span>
                  </span>
                ),
              },
              {
                key: "status",
                label: "Estado",
                render: (row) => {
                  const s = accountStatus[row.status] ?? accountStatus.error;
                  return (
                    <span className="space-y-1">
                      <Badge tone={s?.tone}>{s?.label}</Badge>
                      {row.lastError ? (
                        <span className="block text-xs text-destructive">{row.lastError}</span>
                      ) : null}
                    </span>
                  );
                },
              },
              { key: "since", label: "Conectada", render: (row) => formatDate(row.connectedAt) },
              {
                key: "sync",
                label: "Último gasto",
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
                        <input type="hidden" name="kind" value="ad_account" />
                        <p className="text-sm text-fg-muted">
                          El gasto de Meta dejará de actualizarse.
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
