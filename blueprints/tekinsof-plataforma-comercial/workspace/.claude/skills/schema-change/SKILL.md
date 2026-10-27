---
name: schema-change
description: Use when a table, column, index or constraint must change in the Tekinsof database — "add a column", "new table", "change the schema", "migration". Edits schema.ts, generates the migration with drizzle-kit and proves it applies on PGlite.
---

# Schema change

## When to use
- Any change to `packages/core/src/db/schema.ts`.
- A test fails with "relation … does not exist" or "column … does not exist".

## Steps
1. Edit `packages/core/src/db/schema.ts` only. Follow `.claude/rules/database.md` (snake_case via casing, céntimos, `check` for enums).
2. Destructive change (drop or rename)? Split it: add the new column now, backfill, switch reads, drop in a later release.
3. Run `pnpm db:generate` — drizzle-kit writes a new file under `packages/core/drizzle/`. Do not rename or edit it.
4. Run `pnpm db:migrate` twice (the second run must be a no-op).
5. Add or update the test in `packages/core/test/` that exercises the new constraint.

## Verify
```bash
pnpm db:generate                                       # expect: exit 0
pnpm db:migrate                                        # expect: exit 0
pnpm --filter @tekinsof/core test test/schema.test.ts  # expect: exit 0
pnpm typecheck                                         # expect: exit 0
```

## Do not
- Edit SQL in `packages/core/drizzle/` by hand, or change the schema from the Supabase dashboard.
- Rename a column in one migration while the old code is still deployed.
