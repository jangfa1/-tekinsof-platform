---
paths:
  - "apps/crm/src/**"
  - "apps/crm/e2e/**"
---

# CRM UI

- Pages are server components; `"use client"` only for `pipeline-board.tsx`, `(app)/error.tsx` and leaf widgets that need state.
- Every private page starts with `requireActor()` or `requirePermissionPage(...)`; every server action starts with `authorize(...)`.
- Only `src/lib/env.ts` reads `process.env`; everything else calls `getEnv()`.
- Use `@/components/ui` primitives and token classes (`bg-surface`, `text-fg-muted`, `bg-accent text-accent-fg`); no hex, no arbitrary spacing.
- Every list has empty, loading (layout Suspense) and error (`(app)/error.tsx`) states; filters and page number live in the URL.
- Every `<button>` has an explicit `type`; every input a `<label>`; errors use `role="alert"`.
- Dates via `Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima" })`; money via `formatAmount` with `S/` or `US$`.
- No `dangerouslySetInnerHTML`.
- E2E: `loginAs(page, role)` from `e2e/helpers/login.ts`, one `AxeBuilder` scan per new page, assertions on visible text and status codes.
