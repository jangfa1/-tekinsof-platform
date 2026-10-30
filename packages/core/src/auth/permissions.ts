export const roles = ["gerencia", "ventas", "marketing", "administracion"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "users.manage",
  "settings.manage",
  "leads.read",
  "leads.create",
  "leads.update_own",
  "leads.update_any",
  "leads.assign",
  "accounts.read",
  "accounts.write",
  "opportunities.read",
  "opportunities.write_own",
  "opportunities.write_any",
  "quotes.read",
  "quotes.write_own",
  "quotes.write_any",
  "quotes.approve",
  "quotes.send_own",
  "quotes.send_any",
  "catalog.read",
  "catalog.write",
  "campaigns.write",
  "landings.write",
  "landings.publish",
  "integrations.manage",
  "dashboard.marketing",
] as const;
export type Permission = (typeof permissions)[number];

export type Actor = { id: string; email: string; role: Role };

const grants: Record<Role, readonly Permission[]> = {
  gerencia: permissions,
  ventas: [
    "leads.read",
    "leads.create",
    "leads.update_own",
    "accounts.read",
    "accounts.write",
    "opportunities.read",
    "opportunities.write_own",
    "quotes.read",
    "quotes.write_own",
    "quotes.send_own",
    "catalog.read",
  ],
  marketing: [
    "leads.read",
    "leads.create",
    "accounts.read",
    "opportunities.read",
    "quotes.read",
    "catalog.read",
    "catalog.write",
    "campaigns.write",
    "landings.write",
    "landings.publish",
    "dashboard.marketing",
  ],
  administracion: [
    "leads.read",
    "accounts.read",
    "accounts.write",
    "opportunities.read",
    "quotes.read",
    "catalog.read",
  ],
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

// `*_own` permissions apply only when the resource belongs to the actor; the matching `*_any`
// permission (if the role has it) always applies.
export function can(
  actor: Actor,
  permission: Permission,
  resource?: { ownerId: string | null },
): boolean {
  const granted = grants[actor.role];
  if (permission.endsWith("_own")) {
    const anyPermission = permission.replace(/_own$/, "_any") as Permission;
    if (granted.includes(anyPermission)) return true;
    return granted.includes(permission) && resource !== undefined && resource.ownerId === actor.id;
  }
  return granted.includes(permission);
}
