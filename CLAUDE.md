# Tekinsof — Plataforma comercial

Sitio público (`tekinsof.com`, Astro estático) + CRM interno (`crm.tekinsof.com`, Next.js) sobre una
sola base Postgres, para captar leads, darles seguimiento y cotizar. Usuarios: 3–10 personas de Tekinsof.

## Commands

Todos desde la raíz del repositorio.

| Task | Command |
|---|---|
| Install | `pnpm install` (CI: `pnpm install --frozen-lockfile`) |
| Dev (CRM :3000 + sitio :4321) | `pnpm dev` (los jobs se prueban con los tests de core; Inngest local es opcional). Con PGlite el sitio usa su propia base `.data/web-dev` (`SITE_DEV_DATABASE_URL`), migrada y sembrada al arrancar |
| Build (todo) | `pnpm build` · solo CRM: `pnpm --filter @tekinsof/crm build` · solo sitio: `pnpm --filter @tekinsof/web build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests de core | `pnpm test` · un archivo: `pnpm --filter @tekinsof/core test test/<archivo>.test.ts` |
| E2E (requiere build del CRM) | `pnpm test:e2e` · un archivo: `pnpm --filter @tekinsof/crm test:e2e e2e/<archivo>.spec.ts` |
| Generar migración | `pnpm db:generate` (tras editar `packages/core/src/db/schema.ts`) |
| Aplicar migraciones | `pnpm db:migrate` (usa `DATABASE_URL` del `.env` raíz; local = PGlite en `.data/dev`) |
| Seed | `pnpm db:seed` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha;
más el `Verify` completo de la tarea en `blueprints/tekinsof-plataforma-comercial/tasks.json`.

Node 24 (`.nvmrc`), pnpm 12.14.0 (`packageManager`). Las versiones están en `pnpm-lock.yaml`: léelo, no adivines.

## Stack

TypeScript · Next.js 16 (App Router) · Astro 7 estático · Tailwind v4 (tokens en CSS) · Drizzle ORM ·
Postgres (Supabase en prod, PGlite local y en tests) · Better Auth + Microsoft Entra ID · Inngest ·
Microsoft Graph (correo) · Vercel.

## Architecture

**Camino de una petición (CRM).** navegador → `apps/crm/src/proxy.ts` (¿hay cookie?) →
`src/app/(app)/layout.tsx` (`requireActor()` de `src/lib/actor.ts`: sesión + usuario activo) →
página server component → servicio de `@tekinsof/core/<dominio>/<archivo>` → `getDb()` de
`@tekinsof/core/db/client` → Postgres. Las mutaciones son server actions que primero llaman
`authorize(<permiso>)` y luego al servicio; terminan en `revalidatePath`.

**Camino de un lead.** formulario del sitio (`apps/web/src/components/LeadForm.tsx`) →
`POST crm/api/public/leads` (CORS a `SITE_ORIGIN` + Turnstile) → `createPublicLead` escribe `leads`
+ `outbox` en una transacción → cron `outbox-flush` (Inngest) envía `lead/created` →
`handleLeadCreated` asigna por rotación y manda correos por Graph → `slaSweep` alerta a Gerencia a
las 4 horas laborables.

**Publicar.** `publishLanding` / `setServicePublication` → `requestSitePublish` (fila + outbox) →
función `site-deploy` → `VERCEL_DEPLOY_HOOK_URL` → build de Astro que lee la base.

**Boundaries.**

| Layer | May import from | Must never |
|---|---|---|
| `apps/crm/src/app/**` | `@/lib/*`, `@/components/*`, `@tekinsof/core/*` | abrir conexiones; leer `process.env` |
| `apps/crm/src/components/**` | `@/components/*`, tipos de core | importar `@tekinsof/core/db/*` desde un `"use client"` |
| `apps/web/src/**` | `@tekinsof/core/*` solo en frontmatter/`lib/content.ts` (build) | escribir en la base; llamar al CRM salvo el POST del formulario |
| `packages/core/src/**` | otros módulos de core, librerías | importar de `apps/*`, Next o Astro |
| `packages/core/src/db/client.ts` | `schema.ts` | — es el único que abre conexiones |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Esquema | `packages/core/src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate` |
| Envoltorio de resultados y códigos de error | `packages/core/src/result.ts` |
| Roles y permisos | `packages/core/src/auth/permissions.ts` (`can()`) |
| Env del CRM | `apps/crm/src/lib/env.ts` (`getEnv()`) — nada más lee `process.env` en el CRM |
| Sesión / actor | `apps/crm/src/lib/actor.ts` |
| Tokens de diseño | `apps/crm/src/app/globals.css` (copiados en `apps/web/src/styles/global.css`) |
| Horario laboral | `packages/core/src/time/business-hours.ts` |
| Dinero | `packages/core/src/sales/quote-math.ts` (céntimos enteros, IGV 18%) |

## Code rules

1. **Máximo 300 líneas por componente o módulo.** Más es señal de partir por responsabilidad.
2. **Imports relativos con extensión `.ts`/`.tsx` dentro de `packages/core`**; entre paquetes,
   `@tekinsof/core/<ruta>` sin extensión; en el CRM, alias `@/` → `src/`. Sin barrel files.
3. **Server components por defecto.** `"use client"` solo en la hoja que necesita estado o eventos.
4. **Validar en la frontera:** cada servicio de core parsea su entrada con zod y devuelve
   `{ ok: true, data } | { ok: false, error: { code, message, fields? } }`. Nunca lanza por errores de negocio.
5. **Autorizar antes del trabajo:** toda server action empieza con `authorize(...)`; toda página
   privada con `requireActor()`/`requirePermissionPage(...)`.
6. **Escribir la auditoría en la misma transacción** que el cambio (`writeAudit(tx, …)`).
7. **Dinero en céntimos enteros** y `numeric` como string; jamás `parseFloat` sobre montos.
8. **Fechas:** almacenar `timestamptz`; mostrar con `Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima" })`.
9. **Textos de UI en español (Perú).** Código, nombres de archivos y commits en inglés.

## Design system

Tokens en `globals.css`; los componentes usan nombres de token (`bg-primary`, `text-fg-muted`), nunca hex.

| Role | Light | Dark | Used for |
|---|---|---|---|
| Primary | `#1E2126` | `#ECEDEE` | botones primarios del CRM, navegación activa |
| Accent | `#FF7F5C` (texto `#1E2126`, nunca blanco) | `#FF7F5C` | CTA del sitio |
| Link / focus | `#C2452A` | `#FF9C80` | enlaces, anillo de foco |
| Background / Surface | `#FFFFFF` / `#F7F7F8` | `#121417` / `#1E2126` | página / tarjetas |
| Surface accent | `#E7DBE7` | `#2C2530` | bandas, chips |
| Border | `#E2E3E7` | `#2E323A` | divisores, inputs |
| Text / Muted | `#1E2126` / `#5B606B` | `#ECEDEE` / `#A3A8B3` | texto |
| Destructive / Success / Warning | `#B42318` / `#067647` / `#B54708` | `#F97066` / `#47CD89` / `#FDB022` | estados |

- **Tipos:** títulos Plus Jakarta Sans Variable 700/600; texto Inter Variable 16/24 (tablas 14/20); montos con `tabular-nums`.
- **Espaciado:** base 4px (4, 8, 12, 16, 24, 32, 48, 64, 96). Sin valores arbitrarios.
- **Radio:** 10px controles, 14px tarjetas. **Sombras:** CRM plano con bordes; diálogos `0 10px 30px rgb(18 20 23 / 0.18)`.
- **Movimiento:** 120/180/240ms, solo transform y opacity, respeta `prefers-reduced-motion`.
- **Layout:** sitio 1200px máx.; CRM con barra lateral de 248px (cajón `<details>` bajo 1024px); móvil primero.
- Un solo acento coral por pantalla. El motivo de marca (tres barras inclinadas tinta/coral/lila) solo en el sitio.

## Environment

Lista completa con fuentes: `blueprints/tekinsof-plataforma-comercial/blueprint.md` §10. `.env.example`
está commiteado con valores locales que hacen correr todo sin red; `.env` nunca se commitea.
Producción exige las variables marcadas en `env.ts` (`VERCEL_ENV=production`).

## Rules

Convenciones por área — se cargan solas al tocar esos archivos:

| File | Applies to |
|---|---|
| `.claude/rules/database.md` | `packages/core/src/db/**`, `packages/core/drizzle/**`, `packages/core/scripts/**` |
| `.claude/rules/core-services.md` | `packages/core/src/**`, `packages/core/test/**` |
| `.claude/rules/crm-ui.md` | `apps/crm/src/**`, `apps/crm/e2e/**` |
| `.claude/rules/site.md` | `apps/web/**` |

## Non-negotiable

1. Nunca construir nada de la tabla de Non-Goals del blueprint (§1); si un paso parece pedirlo, detenerse y reportar.
2. Nunca editar ni renombrar archivos de `packages/core/drizzle/`; cambios de esquema = editar `schema.ts` + `pnpm db:generate`.
3. Nunca habilitar `AUTH_TEST_MODE` ni claves de prueba de Turnstile en producción.
4. Nunca commitear secretos, `.env`, `.data/` ni salidas de build.
5. Nunca marcar una tarea como hecha con un comando de su `Verify` fallando, ni editar un `Verify`.
6. Nunca correr `pnpm dev` y un gate que use `.data/dev` a la vez: PGlite bloquea su directorio.
