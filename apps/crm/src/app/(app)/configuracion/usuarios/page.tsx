import { roles } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import {
  type InvitationRow,
  listPendingInvitations,
  listUsers,
  type UserRow,
} from "@tekinsof/core/users/users";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { requirePermissionPage } from "@/lib/actor";
import { inviteAction, setRoleAction, toggleActiveAction } from "./actions";

export const metadata: Metadata = { title: "Usuarios" };

const PATH = "/configuracion/usuarios";

const roleLabels: Record<string, string> = {
  gerencia: "Gerencia",
  ventas: "Ventas",
  marketing: "Marketing",
  administracion: "Administración",
};

const dateFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
});

type SearchParams = Promise<{ error?: string; email?: string; field?: string; ok?: string }>;

// Each form posts to a server action; the outcome comes back through the URL so the page stays
// a server component and works without JavaScript.
function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

async function invite(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const result = await inviteAction({ email, role: String(formData.get("role") ?? "") });
  if (result.ok) back({ ok: "Invitación creada" });
  const fieldError = result.error.fields?.email ?? result.error.fields?.role;
  back(fieldError ? { field: fieldError, email } : { error: result.error.message, email });
}

async function changeRole(formData: FormData) {
  "use server";
  const result = await setRoleAction({
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  back(result.ok ? { ok: "Rol actualizado" } : { error: result.error.message });
}

async function toggleActive(formData: FormData) {
  "use server";
  const result = await toggleActiveAction({
    userId: String(formData.get("userId") ?? ""),
    active: formData.get("active") === "1",
  });
  back(result.ok ? { ok: "Usuario actualizado" } : { error: result.error.message });
}

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermissionPage("users.manage");
  const params = await searchParams;
  const db = getDb();
  const [users, invitations] = await Promise.all([listUsers(db), listPendingInvitations(db)]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Usuarios</h1>

      {params.ok ? (
        <p role="status" className="text-sm text-success">
          {params.ok}
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="text-sm text-destructive">
          {params.error}
        </p>
      ) : null}

      <Card title="Invitar">
        <form action={invite} className="grid gap-4 md:grid-cols-3 md:items-end">
          <Field id="invite-email" label="Correo" error={params.field}>
            <Input
              name="email"
              type="email"
              required
              autoComplete="off"
              defaultValue={params.email}
            />
          </Field>
          <Field id="invite-role" label="Rol">
            <Select name="role" defaultValue="ventas">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Invitar</Button>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Invitaciones pendientes</h2>
        {invitations.length === 0 ? (
          <EmptyState title="Sin invitaciones pendientes" text="Invita a alguien del equipo." />
        ) : (
          <Table<InvitationRow>
            caption="Invitaciones pendientes"
            rows={invitations}
            rowKey={(row) => row.id}
            columns={[
              { key: "email", label: "Correo", render: (row) => row.email },
              { key: "role", label: "Rol", render: (row) => roleLabels[row.role] ?? row.role },
              {
                key: "createdAt",
                label: "Enviada",
                render: (row) => dateFormat.format(row.createdAt),
              },
            ]}
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Equipo</h2>
        <Table<UserRow>
          caption="Usuarios del CRM"
          rows={users}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", label: "Nombre", render: (row) => row.name },
            { key: "email", label: "Correo", render: (row) => row.email },
            {
              key: "role",
              label: "Rol",
              render: (row) => (
                <form action={changeRole} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={row.id} />
                  <label htmlFor={`role-${row.id}`} className="sr-only">
                    Rol de {row.name}
                  </label>
                  <Select id={`role-${row.id}`} name="role" defaultValue={row.role}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
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
              key: "active",
              label: "Activo",
              render: (row) =>
                row.isActive ? <Badge tone="success">Sí</Badge> : <Badge tone="danger">No</Badge>,
            },
            {
              key: "receivesLeads",
              label: "Recibe leads",
              render: (row) => (row.role === "ventas" && row.receivesLeads ? "Sí" : "No"),
            },
            {
              key: "actions",
              label: "Acciones",
              render: (row) => (
                <form action={toggleActive}>
                  <input type="hidden" name="userId" value={row.id} />
                  <input type="hidden" name="active" value={row.isActive ? "0" : "1"} />
                  <Button type="submit" variant={row.isActive ? "danger" : "ghost"}>
                    {row.isActive ? "Desactivar" : "Reactivar"}
                  </Button>
                </form>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
