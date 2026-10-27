---
paths:
  - "packages/core/src/db/**"
  - "packages/core/drizzle/**"
  - "packages/core/scripts/**"
---

# Database

- `schema.ts` is the only schema source; columns are declared without names (`text()`), and `casing: "snake_case"` maps them. Never pass explicit SQL column names.
- Every table has `id` (uuid `defaultRandom()`, except Better Auth tables: text), `created_at`, and `updated_at` with `$onUpdate`.
- Money: `bigint({ mode: "number" })` céntimos + `currency` text checked to `PEN|USD`. Rates and percentages: `numeric` (a string in TypeScript).
- Enumerations are `text` + `check(...)`, never `pgEnum`.
- Commercial entities soft-delete with `deleted_at`; every list query filters `deleted_at is null`.
- Foreign keys state `onDelete` explicitly (`set null`, `restrict`, `cascade`) — see blueprint §4 Relationships.
- `client.ts` is the only module that opens a connection; production uses the pooler with `prepare: false`.
- Migrations: `pnpm db:generate` names the files; never edit or rename them; never apply DDL from the Supabase dashboard.
- PGlite holds an exclusive lock on its directory: one process per `.data/<dir>` at a time.
