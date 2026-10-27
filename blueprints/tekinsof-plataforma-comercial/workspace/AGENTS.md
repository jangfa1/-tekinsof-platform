# Tekinsof — Plataforma comercial — agent instructions

Sitio público Astro (`apps/web`) + CRM Next.js (`apps/crm`) + dominio compartido (`packages/core`) sobre
una sola base Postgres (PGlite en local y tests).

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests | `pnpm test` · `pnpm --filter @tekinsof/core test test/<archivo>.test.ts` |
| E2E | `pnpm --filter @tekinsof/crm build && pnpm test:e2e` |
| DB | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` |

## Non-negotiable

1. Nunca construir nada de los Non-Goals del blueprint (§1).
2. Nunca editar archivos de `packages/core/drizzle/`; cambiar `schema.ts` y correr `pnpm db:generate`.
3. Nunca habilitar `AUTH_TEST_MODE` ni claves de prueba de Turnstile en producción.
4. Nunca commitear secretos, `.env`, `.data/` ni salidas de build.
5. Nunca marcar una tarea hecha con su `Verify` fallando, ni editar un `Verify`.
6. Nunca correr `pnpm dev` y un gate sobre `.data/dev` a la vez.

Arquitectura, fronteras y tokens de diseño: `CLAUDE.md` en este directorio (fuente de verdad).
Orden de construcción: `blueprints/tekinsof-plataforma-comercial/tasks.json` y `epics/`.
