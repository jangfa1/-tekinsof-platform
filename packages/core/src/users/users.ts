import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can, isRole, type Role, roles } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { invitations, sessions, users } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

const E2E_DOMAIN = "@e2e.tekinsof.test";

const admitInput = z.object({
  email: z.string().trim().min(1),
  requestedRole: z.string().optional(),
  testMode: z.boolean(),
  bootstrapEmail: z.string().trim().min(1),
  allowedDomain: z.string().trim().min(1),
});

// Decides whether a first-time sign-in may create a user, and with which role. Order matters:
// bootstrap admin → E2E test accounts → allowed domain → a pending invitation.
export async function admitUser(
  db: DbOrTx,
  input: z.input<typeof admitInput>,
): Promise<Result<{ role: Role; invitationId: string | null }>> {
  const parsed = admitInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { requestedRole, testMode, allowedDomain } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (email === parsed.data.bootstrapEmail.toLowerCase()) {
    return ok({ role: "gerencia", invitationId: null });
  }
  if (testMode && email.endsWith(E2E_DOMAIN)) {
    const role = requestedRole && isRole(requestedRole) ? requestedRole : "ventas";
    return ok({ role, invitationId: null });
  }
  if (!email.endsWith(`@${allowedDomain.toLowerCase()}`)) {
    return err("FORBIDDEN", "Dominio no permitido");
  }
  const [invitation] = await db
    .select({ id: invitations.id, role: invitations.role })
    .from(invitations)
    .where(and(pendingInvitationFor(email)))
    .limit(1);
  if (!invitation || !isRole(invitation.role)) return err("FORBIDDEN", "Sin invitación");
  return ok({ role: invitation.role, invitationId: invitation.id });
}

export async function markInvitationAccepted(db: DbOrTx, email: string): Promise<void> {
  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(pendingInvitationFor(email.toLowerCase()));
}

const inviteInput = z.object({
  email: z.email("Correo inválido").trim().toLowerCase(),
  role: z.enum(roles, "Rol inválido"),
});

export async function inviteUser(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof inviteInput>,
  opts: { allowedDomain: string },
): Promise<Result<{ invitationId: string }>> {
  if (!can(actor, "users.manage")) return err("FORBIDDEN", "No tienes permiso para invitar");
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { email, role } = parsed.data;
  if (!email.endsWith(`@${opts.allowedDomain.toLowerCase()}`)) {
    return err("VALIDATION_ERROR", "Datos inválidos", { email: "Dominio no permitido" });
  }

  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existingUser) {
      return err("CONFLICT", "Ya existe un usuario con ese correo", { email: "Ya es usuario" });
    }
    const [pending] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(pendingInvitationFor(email))
      .limit(1);
    if (pending) {
      return err("CONFLICT", "Ya existe una invitación pendiente", {
        email: "Ya tiene una invitación pendiente",
      });
    }
    // A revoked invitation keeps its row (email is unique): reopen it instead of inserting.
    const [row] = await tx
      .insert(invitations)
      .values({ email, role, invitedBy: actor.id })
      .onConflictDoUpdate({
        target: invitations.email,
        set: { role, invitedBy: actor.id, acceptedAt: null, revokedAt: null },
      })
      .returning({ id: invitations.id });
    if (!row) return err("INTERNAL", "No se pudo crear la invitación");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.invited",
      targetType: "invitation",
      targetId: row.id,
      metadata: { email, role },
    });
    return ok({ invitationId: row.id });
  });
}

const userIdInput = z.object({ userId: z.string().min(1) });
const setRoleInput = userIdInput.extend({ role: z.enum(roles, "Rol inválido") });

export async function setUserRole(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof setRoleInput>,
): Promise<Result<{ userId: string; role: Role }>> {
  if (!can(actor, "users.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = setRoleInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { userId, role } = parsed.data;

  return db.transaction(async (tx) => {
    const target = await findUser(tx, userId);
    if (!target) return err("NOT_FOUND", "Usuario no encontrado");
    if (target.isActive && target.role === "gerencia" && role !== "gerencia") {
      if ((await countActiveGerencia(tx)) <= 1) {
        return err("FORBIDDEN", "Debe quedar al menos un usuario de Gerencia activo");
      }
    }
    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.role_changed",
      targetType: "user",
      targetId: userId,
      metadata: { from: target.role, to: role },
    });
    return ok({ userId, role });
  });
}

export async function deactivateUser(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof userIdInput>,
): Promise<Result<{ userId: string }>> {
  if (!can(actor, "users.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = userIdInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { userId } = parsed.data;

  return db.transaction(async (tx) => {
    const target = await findUser(tx, userId);
    if (!target) return err("NOT_FOUND", "Usuario no encontrado");
    if (target.isActive && target.role === "gerencia" && (await countActiveGerencia(tx)) <= 1) {
      return err("FORBIDDEN", "Debe quedar al menos un usuario de Gerencia activo");
    }
    await tx.update(users).set({ isActive: false }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.deactivated",
      targetType: "user",
      targetId: userId,
    });
    return ok({ userId });
  });
}

export async function reactivateUser(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof userIdInput>,
): Promise<Result<{ userId: string }>> {
  if (!can(actor, "users.manage")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = userIdInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { userId } = parsed.data;

  return db.transaction(async (tx) => {
    const target = await findUser(tx, userId);
    if (!target) return err("NOT_FOUND", "Usuario no encontrado");
    await tx.update(users).set({ isActive: true }).where(eq(users.id, userId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.reactivated",
      targetType: "user",
      targetId: userId,
    });
    return ok({ userId });
  });
}

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  receivesLeads: boolean;
};

export async function listUsers(db: DbOrTx): Promise<UserRow[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      receivesLeads: users.receivesLeads,
    })
    .from(users)
    .orderBy(asc(users.name));
}

export type InvitationRow = { id: string; email: string; role: string; createdAt: Date };

export async function listPendingInvitations(db: DbOrTx): Promise<InvitationRow[]> {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .orderBy(desc(invitations.createdAt));
}

function pendingInvitationFor(email: string) {
  return and(
    sql`lower(${invitations.email}) = ${email}`,
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
  );
}

async function findUser(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

async function countActiveGerencia(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "gerencia"), eq(users.isActive, true)));
  return row?.n ?? 0;
}
