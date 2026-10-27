---
name: crm-page
description: Use when adding or changing a screen in the Tekinsof CRM — "new page", "list of X", "form to create Y", "add a button that changes Z". Builds a server-rendered page with a permission check, a server action calling a core service, and an axe-clean E2E.
---

# CRM page

## When to use
- A new route under `apps/crm/src/app/(app)/`.
- A new form or action on an existing CRM page.

## Steps
1. Put business logic in a `packages/core/src/<domain>/<file>.ts` service: zod input, `can()` check, `Result` return, `writeAudit` in the same transaction.
2. Page = server component. First line: `await requirePermissionPage("<permission>")`.
3. Mutations = server actions that start with `const auth = await authorize("<permission>")`, call the service, return its `Result`, and `revalidatePath` on success.
4. Use primitives from `@/components/ui` and token classes only (no hex). Lists: `Table`, `EmptyState`, `Pagination`; filters in the URL.
5. Field errors come from `error.fields`, rendered in `Field` with `role="alert"`.
6. Add or extend an E2E in `apps/crm/e2e/` with `loginAs(page, role)` and an `AxeBuilder` scan.

## Verify
```bash
pnpm typecheck                                              # expect: exit 0
pnpm lint                                                   # expect: exit 0
pnpm --filter @tekinsof/crm build                           # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/<file>.spec.ts     # expect: exit 0
```

## Do not
- Hide a button as the only protection — the action must call `authorize`.
- Import `@tekinsof/core/db/*` from a `"use client"` file.
