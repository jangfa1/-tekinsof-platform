---
paths:
  - "packages/core/src/**"
  - "packages/core/test/**"
---

# Core services

- Signature: `fn(db: DbOrTx, actor: Actor, input)` (or `deps` for integrations); validate `input` with zod first; return `Result` from `../result.ts`; never throw for business errors.
- Authorization inside the service with `can(actor, permission, { ownerId })` — routes check too, services check again.
- Multi-row changes and their `writeAudit` / `outbox` rows go in one `db.transaction`.
- Integrations (Graph, Turnstile, Storage, Vercel hook, Inngest send) are injected through `deps`; tests use the `log`/`local` drivers or fakes, never the network.
- Relative imports carry the `.ts`/`.tsx` extension (Node runs `scripts/*.ts` directly).
- Time: pass `now` in `deps` for anything time-dependent; Lima time only through `time/business-hours.ts`.
- Tests: one `createTestDb()` per file in `beforeAll`, `close()` in `afterAll`; no shared state, no `.only` or `.skip`.
- Only `cms/blocks.tsx` uses JSX; `sales/quote-delivery.ts` uses `createElement`.
