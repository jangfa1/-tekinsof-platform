import { type Actor, can, isRole, type Permission } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import { users } from "@tekinsof/core/db/schema";
import { err, ok, type Result } from "@tekinsof/core/result";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";

export type SessionActor = Actor & { name: string };

// The session alone is not enough: the user row must still exist, be active and carry a known role.
export async function getActor(): Promise<SessionActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row?.isActive || !isRole(row.role)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function requireActor(): Promise<SessionActor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

// For server actions: never throws, returns the envelope the action hands back to the form.
export async function authorize(
  permission: Permission,
  resource?: { ownerId: string | null },
): Promise<Result<SessionActor>> {
  const actor = await getActor();
  if (!actor) return err("UNAUTHENTICATED", "Tu sesión expiró. Vuelve a entrar.");
  if (!can(actor, permission, resource)) return err("FORBIDDEN", "No tienes permiso");
  return ok(actor);
}

// For pages: a missing permission looks like a missing page.
export async function requirePermissionPage(permission: Permission): Promise<SessionActor> {
  const actor = await requireActor();
  if (!can(actor, permission)) notFound();
  return actor;
}
