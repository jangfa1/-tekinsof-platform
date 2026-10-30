import { DEFAULT_ORGANIZATION_ID } from "@tekinsof/core/db/schema";

// The organization every request works in. Single-tenant today (blueprint R2 §1 Non-Goals); the
// SaaS phase resolves it from the session's membership here, and nowhere else changes.
export function currentOrganizationId(): string {
  return DEFAULT_ORGANIZATION_ID;
}
