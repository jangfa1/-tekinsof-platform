# Epic 02: Captación

> Después de este epic un lead del sitio o de WhatsApp entra a una sola bandeja con su origen, se asigna por rotación con avisos por correo, y Gerencia es alertada si pasan 4 horas laborables sin contacto.

| | |
|---|---|
| **Epic id** | `02-captacion` |
| **Tasks** | `E2-T1` … `E2-T6` |
| **Depends on** | `01-fundaciones` |
| **Unlocks** | `03-conversion-y-campanas` |
| **Parallel with** | la tarea `E2-T4` (sitio) solo depende de `E1-T1` y no comparte archivos con las demás |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (CRM, App Router) · Astro 7 estático (sitio) · TypeScript 6 · Tailwind CSS v4 con tokens · Postgres (Supabase en producción; **PGlite** en local, tests y E2E) · Drizzle ORM · Better Auth + Microsoft Entra ID · Inngest · Microsoft Graph · Vercel.
Package manager: `pnpm` 12.14.0. Runtime pinned in `.nvmrc` (Node 24). Dependency versions are in
the lockfile — read it, never guess one.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (one file, core) | `pnpm --filter @tekinsof/core test test/<archivo>.test.ts` |
| E2E (one file; build the CRM first) | `pnpm --filter @tekinsof/crm build && pnpm --filter @tekinsof/crm test:e2e e2e/<archivo>.spec.ts` |
| Migrate / seed | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` |
| Local services | none — PGlite runs in-process (`.data/dev`, `.data/e2e`); no Docker |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

All commands run from the **project root** (the directory holding `CLAUDE.md`), never from the bundle.
The configs every gate needs (`biome.json`, `tsconfig*.json`, `vitest.config.ts`, `playwright.config.ts`,
`drizzle.config.ts`, `scripts/migrate.ts`, `e2e/helpers/login.ts`, `.env.example` → `.env`) shipped in
`workspace/` and are already at the project root — you do not write them.

Envelope for every service and JSON route: `{ ok: true, data } | { ok: false, error: { code, message, fields? } }`,
codes `VALIDATION_ERROR` 400 · `CAPTCHA_FAILED` 403 · `ORIGIN_NOT_ALLOWED` 403 · `UNAUTHENTICATED` 401 ·
`FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `INVALID_TRANSITION` 409 · `APPROVAL_REQUIRED` 409 · `INTERNAL` 500
(`packages/core/src/result.ts`).

## Directory subtree

Only the parts this epic touches:

```
packages/core/src/
  crm/accounts.ts                             # NEW (7)
  leads/leads.ts · leads/activities.ts        # NEW (8)
  integrations/graph.ts                       # NEW (11)
  automation/lead-created.ts                  # NEW (11)
  time/business-hours.ts                      # NEW (12)
  automation/sweeps.ts                        # NEW (12)
packages/core/test/accounts · leads · lead-created · business-hours · sweeps .test.ts   # NEW
apps/crm/src/app/(app)/empresas/page.tsx · empresas/[id]/page.tsx · contactos/page.tsx   # NEW (7)
apps/crm/src/app/api/public/leads/route.ts    # NEW (8)
apps/crm/src/app/(app)/leads/page.tsx         # REPLACE the step-5 placeholder (9)
apps/crm/src/app/(app)/leads/nuevo/page.tsx · leads/[id]/page.tsx   # NEW (9)
apps/crm/src/lib/inngest.ts                   # NEW (11), edited (12)
apps/crm/src/app/api/inngest/route.ts         # NEW (11)
apps/crm/e2e/public-leads.spec.ts · leads.spec.ts   # NEW (8, 9)
apps/web/src/styles/global.css · layouts/Base.astro · components/LeadForm.tsx   # NEW (10)
apps/web/src/pages/index.astro                # REPLACE the step-1 placeholder (10)
apps/web/src/pages/privacidad.astro           # NEW (10)
packages/core/src/db/schema.ts · client.ts · result.ts · auth/permissions.ts · audit/audit.ts   # exist — read-only
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `companies`, `contacts` | name, ruc (11 digits, unique), phone E.164, owner, soft delete | step 7 |
| `campaigns`, `leads` | source, status, campaign, UTM, consent, owner, SLA columns | step 8; checks: consent for public sources, email or phone |
| `activities` | type, subject, due/done/reminded, parent lead/opportunity/contact | step 8 |
| `outbox` | event_name, payload, attempts, sent_at | written with the business row; flushed in step 12 |
| `holidays`, `site_publishes`, `quotes` (read) | date; publish requests; sent quotes for expiry | step 12 |

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundaciones` | `getDb`, `createTestDb`, `Db`, `DbOrTx` (`@tekinsof/core/db/client`) | typed Drizzle db; tests get a fresh migrated PGlite |
| `01-fundaciones` | `can`, `Actor`, `writeAudit`, `Result` helpers | as in their files |
| `01-fundaciones` | `getEnv()`, `authorize()`, `requirePermissionPage()`, `requireActor()`, `ui.tsx` primitives | as in their files |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `crm/accounts.ts` → `normalizePhonePe`, `createCompany`, `createContact`, `listCompanies`, `getCompany`, `listContacts` | see step 7 | 03 |
| `leads/leads.ts` → `publicLeadInput`, `createPublicLead`, `createManualLead`, `changeLeadStatus`, `listLeads`, `getLead` | see step 8 | 03 |
| `leads/activities.ts` → `addActivity`, `completeActivity`, `listActivities` | see step 8 | 03 (opportunity detail) |
| `integrations/graph.ts` → `createMailer` | `{ send, getAccountEnabled, outbox }` | 03 (quote delivery) |
| `time/business-hours.ts` → `addBusinessHours`, `limaDate`, `isBusinessDay` | see file | 03 (quote validity) |
| `automation/sweeps.ts` → `requestSitePublish` | `(tx, { requestedBy, reason }) => Promise<string>` | 03 (catalog, landings) |
| `apps/crm/src/lib/inngest.ts` → `inngest`, `functions` | Inngest v4 client and function list | 03 |

## Conventions that bite in this area

- No route or service calls Inngest directly: events go to `outbox` inside the transaction and `outbox-flush` sends them.
- Turnstile keys starting `1x`/`2x` are Cloudflare's test keys and are emulated without network; production refuses them in `env.ts`.
- The site is static: `PUBLIC_*` values are read from `process.env` at build time and passed to the island as props.
- Mail sending is always `deps.mailer`; tests use the `log` driver and assert on `mailer.outbox`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `.claude/rules/core-services.md`,
`.claude/rules/crm-ui.md`, `.claude/rules/site.md`. Both sit in the project root — the builder copied
them there from the bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick. Any §4, §5, §7 or §8 a task mentions is copied
verbatim under **Reference** at the end of this file — you never need `blueprint.md`.

### `E2-T1` — Accounts: companies and contacts

**Depends on:** `E1-T6` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/crm/accounts.ts` — exporta (zod + `Result`, permisos con `can` del paso 3):
  - `normalizePhonePe(raw: string): string | null` — quita espacios, guiones y paréntesis; `9XXXXXXXX`
    (9 dígitos) → `+519XXXXXXXX`; `51` + 9 dígitos → `+51…`; ya en `+<dígitos>` (8–15) se conserva;
    cualquier otra cosa → `null`.
  - `createCompany(db, actor, input)`, `updateCompany(db, actor, id, input)`,
    `softDeleteCompany(db, actor, id)` — requieren `accounts.write`; `ruc` opcional que debe cumplir
    `^(10|15|16|17|20)\d{9}$` (si no: `VALIDATION_ERROR` con `fields.ruc = "RUC inválido"`); RUC
    duplicado entre no borradas → `CONFLICT`; `owner_id` = actor por defecto; auditoría
    `company.created`, `company.updated`, `company.deleted`.
  - `createContact(db, actor, input)`, `updateContact(db, actor, id, input)` — `accounts.write`;
    `phone` pasa por `normalizePhonePe` (`null` → `VALIDATION_ERROR` en `fields.phone`); email en
    minúsculas; email duplicado entre no borrados → `CONFLICT`.
  - `listCompanies(db, { q?, page })`, `getCompany(db, id)` (con sus contactos y oportunidades
    abiertas), `listContacts(db, { q?, page })` — excluyen `deleted_at` no nulo; 25 por página.
- `packages/core/test/accounts.test.ts` — sobre `createTestDb()` con un usuario `ventas` y uno
  `marketing`: alta válida; RUC `12345` → `VALIDATION_ERROR` en `fields.ruc`; RUC repetido →
  `CONFLICT`; `normalizePhonePe("987 654 321")` → `"+51987654321"`; `normalizePhonePe("12")` →
  `null`; marketing creando empresa → `FORBIDDEN`; empresa borrada lógicamente no aparece en
  `listCompanies`.
- `apps/crm/src/app/(app)/empresas/page.tsx` — tabla con búsqueda `?q=`, paginación y formulario
  "Nueva empresa" dentro de `<details>`; server action con `authorize("accounts.write")`.
- `apps/crm/src/app/(app)/empresas/[id]/page.tsx` — datos editables, contactos de la empresa con
  formulario "Agregar contacto", oportunidades abiertas (lista vacía hasta el paso 13).
- `apps/crm/src/app/(app)/contactos/page.tsx` — tabla con búsqueda y formulario "Nuevo contacto".

**Files**
- `packages/core/src/crm/accounts.ts`
- `packages/core/test/accounts.test.ts`
- `apps/crm/src/app/(app)/empresas/page.tsx`
- `apps/crm/src/app/(app)/empresas/[id]/page.tsx`
- `apps/crm/src/app/(app)/contactos/page.tsx`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `createCompany` receives RUC `12345` **THE SYSTEM SHALL** return `VALIDATION_ERROR` with `fields.ruc` and insert nothing.
2. **WHEN** a second company is created with an existing RUC **THE SYSTEM SHALL** return `CONFLICT`.
3. **WHEN** a contact phone `987 654 321` is saved **THE SYSTEM SHALL** store `+51987654321`.
4. **WHEN** a `marketing` actor calls `createCompany` **THE SYSTEM SHALL** return `FORBIDDEN`.
5. **WHEN** a company is soft-deleted **THE SYSTEM SHALL** omit it from `listCompanies` while the row stays in the table.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/accounts.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: Accounts: companies and contacts"
git tag step-07-accounts

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E2-T2` — Leads core: lead and activity services, public endpoint

**Depends on:** `E2-T1` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/leads/leads.ts` — exporta:
  - `publicLeadInput` (zod) exactamente con las reglas del §5 (`POST /api/public/leads`).
  - `createPublicLead(db, input): Promise<Result<{ leadId: string | null; deduplicated: boolean }>>` —
    honeypot `website` no vacío → `ok({ leadId: null, deduplicated: false })` sin escribir;
    deduplica por `lower(email)` (o `phone` si no hay email) en `created_at > now() - interval '24 hours'`
    y `deleted_at is null` → `ok({ leadId: <existente>, deduplicated: true })`; si no, en **una
    transacción**: inserta el lead (`source` = `landing` si hay `landingSlug`, si no `web_form`;
    `consent_at = now()`; `campaign_id` desde `campaignSlug` o `utm.campaign` contra
    `campaigns.slug`; teléfono con `normalizePhonePe` del paso 7) y una fila `outbox`
    (`lead/created`, `{ leadId }`).
  - `createManualLead(db, actor, input)` — `leads.create`; `source` ∈ whatsapp, referral, manual,
    event, other (default `whatsapp`); `owner_id` = actor si su rol es `ventas`; `created_by` = actor;
    `consent_at` nulo permitido; outbox `lead/created`; auditoría `lead.created`.
  - `changeLeadStatus(db, actor, { leadId, to, reason? })` — transiciones del §5; `leads.update_own`
    sobre el lead (vía `can` con `ownerId`); `descartado` exige `reason` (→ `discard_reason`);
    pasar a `contactado` fija `first_contacted_at` si es nulo; auditoría `lead.status_changed`
    (`{ from, to }`).
  - `listLeads(db, { status?, ownerId?, source?, campaignId?, page })` (orden `created_at desc`, 25
    por página) y `getLead(db, id)` (con campaña, dueño y actividades).
- `packages/core/src/leads/activities.ts` — `addActivity(db, actor, { type, subject, notes?, dueAt?, leadId? | opportunityId? | contactId? })`:
  permiso `leads.update_own` sobre el lead padre u `opportunities.write_own` sobre la oportunidad
  padre; si el padre es un lead sin `first_contacted_at` y el tipo es `llamada`, `reunion`, `correo`
  o `whatsapp`, fija `first_contacted_at = now()` y, si está `nuevo`, lo pasa a `contactado`.
  `completeActivity(db, actor, activityId)` fija `done_at`. `listActivities(db, { leadId? | opportunityId? })`.
- `packages/core/test/leads.test.ts` — cubre: `campaignSlug` existente resuelve `campaign_id`; el
  segundo envío con el mismo email en 24 h devuelve `deduplicated: true` y el mismo `leadId`, y
  `outbox` tiene una sola fila `lead/created` para ese lead; honeypot no escribe nada;
  `nuevo → convertido` devuelve `INVALID_TRANSITION`; `descartado` sin motivo → `VALIDATION_ERROR`;
  un `ventas` cambiando el estado del lead de otro vendedor → `FORBIDDEN`; `addActivity` tipo
  `llamada` sobre un lead `nuevo` lo deja `contactado` con `first_contacted_at` no nulo.
- `apps/crm/src/app/api/public/leads/route.ts` — `OPTIONS` y `POST` según §5. `Origin` distinto de
  `getEnv().SITE_ORIGIN` → 403 `ORIGIN_NOT_ALLOWED`. JSON inválido → 400 `VALIDATION_ERROR`.
  Turnstile: si `TURNSTILE_SECRET_KEY` empieza con `1x` se acepta sin red y con `2x` se rechaza sin
  red (el comportamiento documentado de las claves de prueba de Cloudflare, emulado para que ningún
  gate salga de la máquina; `env.ts` prohíbe esas claves en producción); en cualquier otro caso
  `fetch` a `siteverify` con `secret`, `response` y `remoteip` (`x-forwarded-for`). Llama
  `createPublicLead(getDb(), input)` y responde con `httpStatus` de `@tekinsof/core/result` y los
  encabezados CORS del §5 en toda respuesta. Nunca llama a Inngest (el outbox lo hace en el paso 12).
- `apps/crm/e2e/public-leads.spec.ts` — solo `request`, con encabezado
  `Origin: http://localhost:4321` salvo donde se indica: (1) POST válido → 201 y `data.leadId` con
  forma de UUID; (2) mismo email otra vez → 200, `deduplicated: true`, mismo `leadId`; (3)
  `Origin: https://evil.example` → 403 `ORIGIN_NOT_ALLOWED`; (4) `consent: false` → 400 con
  `error.fields.consent`; (5) `OPTIONS` → 204 con `access-control-allow-origin: http://localhost:4321`;
  (6) `website: "x"` → 201 con `data.leadId === null`.

**Files**
- `packages/core/src/leads/leads.ts`
- `packages/core/src/leads/activities.ts`
- `packages/core/test/leads.test.ts`
- `apps/crm/src/app/api/public/leads/route.ts`
- `apps/crm/e2e/public-leads.spec.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** a valid lead is posted from `SITE_ORIGIN` **THE SYSTEM SHALL** respond 201 with `{ ok: true, data: { leadId, deduplicated: false } }` and write one `leads` row and one `outbox` row named `lead/created`.
2. **WHEN** the same email is posted again within 24 hours **THE SYSTEM SHALL** respond 200 with `deduplicated: true` and the original `leadId`, writing no new row.
3. **WHEN** the `Origin` header differs from `SITE_ORIGIN` **THE SYSTEM SHALL** respond 403 with `error.code = "ORIGIN_NOT_ALLOWED"`.
4. **WHEN** `consent` is not `true` **THE SYSTEM SHALL** respond 400 with `error.code = "VALIDATION_ERROR"` and `error.fields.consent` set.
5. **WHEN** a `ventas` actor changes the status of a lead owned by another user **THE SYSTEM SHALL** return `FORBIDDEN`.
6. **WHEN** a `llamada` activity is added to a `nuevo` lead **THE SYSTEM SHALL** set `first_contacted_at` and move the lead to `contactado`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/leads.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/public-leads.spec.ts # expect: exit 0, 6 tests pass
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: Leads core: lead and activity services, public endpoint"
git tag step-08-leads-core

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E2-T3` — Leads UI: inbox, detail and quick add for WhatsApp leads

**Depends on:** `E1-T6`, `E2-T2` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `apps/crm/src/app/(app)/leads/page.tsx` — reemplaza el provisional. Filtros en la URL (`estado`,
  `dueno=mios|todos`, `origen`, `page`); columnas: nombre, empresa, origen (+ campaña o
  `utm_campaign`), estado (`Badge`), dueño, fecha (`Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })`),
  y `Badge danger` "SLA vencido" cuando `sla_alerted_at` no es nulo y `first_contacted_at` es nulo.
  Botón "Registrar lead" → `/leads/nuevo`. Etiquetas de origen: `web_form` "Formulario web",
  `landing` "Landing", `whatsapp` "WhatsApp", `referral` "Referido", `manual` "Manual", `event`
  "Evento", `other` "Otro". `EmptyState` cuando no hay filas.
- `apps/crm/src/app/(app)/leads/nuevo/page.tsx` — alta rápida pensada para el celular: visibles
  **Nombre**, **Teléfono** y **Servicio de interés** (`<select>` de servicios activos); un
  `<details>` "Más datos" con correo, empresa, mensaje y origen (default WhatsApp). Server action →
  `createManualLead` → `redirect("/leads/<id>")`; errores por campo con `aria-live`.
- `apps/crm/src/app/(app)/leads/[id]/page.tsx` — datos del lead, atribución (UTM, campaña, landing,
  referrer), formulario de cambio de estado (con "Motivo" obligatorio para descartar), formulario
  "Registrar actividad" (tipo, asunto, notas, vencimiento opcional) y línea de tiempo de actividades.
  Acciones vía `changeLeadStatus` y `addActivity`/`completeActivity`.
- `apps/crm/e2e/leads.spec.ts`: (1) un `ventas` registra en `/leads/nuevo` "Carlos Quispe" con
  teléfono `987654321`, termina en `/leads/<uuid>` y la página muestra "WhatsApp" y
  `+51987654321`; (2) ese lead aparece en `/leads?dueno=mios`; (3) cambiar a "Contactado" muestra el
  badge "Contactado"; (4) "Descartado" sin motivo muestra el error "Indica el motivo"; (5) un lead
  enviado por `POST /api/public/leads` (con `Origin: http://localhost:4321`) aparece en `/leads` de
  un `gerencia` con origen "Formulario web"; (6) axe sin violaciones serias en `/leads`.

**Files**
- `apps/crm/src/app/(app)/leads/page.tsx`
- `apps/crm/src/app/(app)/leads/nuevo/page.tsx`
- `apps/crm/src/app/(app)/leads/[id]/page.tsx`
- `apps/crm/e2e/leads.spec.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** a `ventas` user submits the quick-add form with name and a 9-digit phone **THE SYSTEM SHALL** create a `whatsapp` lead owned by that user and land on its detail page showing `+51987654321`.
2. **WHEN** the status form moves a lead to `contactado` **THE SYSTEM SHALL** render the badge "Contactado" after the redirect.
3. **WHEN** `descartado` is submitted without a reason **THE SYSTEM SHALL** show the field error "Indica el motivo" and leave the status unchanged.
4. **WHEN** a lead arrives through the public endpoint **THE SYSTEM SHALL** list it in a `gerencia` user's `/leads` with origin "Formulario web".
5. **WHEN** axe scans `/leads` **THE SYSTEM SHALL** report zero serious or critical violations.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/leads.spec.ts
pnpm --filter @tekinsof/crm test:e2e e2e/shell.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: Leads UI: inbox, detail and quick add for WhatsApp leads"
git tag step-09-leads-ui

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E2-T4` — Public site base: home, lead form with Turnstile and UTM, WhatsApp, consent, privacy

**Depends on:** `E1-T1` · **Priority:** p0 — metadata for scope cuts, not
a running order

Crear en `apps/web` (los valores `PUBLIC_*` se leen de `process.env` en el frontmatter, en build,
con los defaults locales de `.env.example`, y se pasan a la isla como props):

- `src/styles/global.css` — `@import "tailwindcss";`, las dos fuentes de Fontsource, los mismos
  tokens claros del §7 (el sitio no tiene modo oscuro en R1), el mismo `@theme inline`, y
  `@source "../../../../packages/core";` para que Tailwind vea los bloques del paso 17.
- `src/layouts/Base.astro` — props `{ title, description, canonical, noindex?: boolean }`; `<head>`
  con charset, viewport, `<title>`, description, `<link rel="canonical">`, Open Graph
  (`og:title`, `og:description`, `og:url`, `og:locale` = `es_PE`), `robots` `noindex` cuando
  corresponde, y un `<script type="application/ld+json">` con `@type: "Organization"`, `name`
  "Tekinsof Consulting", `url` "https://tekinsof.com", `email` "info@tekinsof.com", `telephone`
  "+51959926642", `address` (`streetAddress` "Av. Separadora Industrial Nro. 3144, Urb. Mayorazgo Etapa Tres", `addressLocality` "Lima",
  `addressRegion` "Lima", `addressCountry` "PE"). Cabecera: logo textual, enlaces "Servicios"
  (`/#servicios`), "Contacto" (`/#contacto`), botón `accent` "Agenda una reunión" a
  `PUBLIC_BOOKINGS_URL`. Pie con dirección, correo, teléfono y enlace "Política de privacidad"
  (`/privacidad`). Botón flotante de WhatsApp: `<a href="https://wa.me/51959926642?text=…">` (número fijo en `packages/core/src/company.ts`)
  con `aria-label="Escríbenos por WhatsApp"`; el texto es "Hola Tekinsof, quiero información
  (<ruta>)" y un script inline de 10 líneas le agrega ` [<utm_campaign>]` si `sessionStorage.tk_utm`
  lo tiene. Banner de consentimiento **solo si** hay algún ID de píxel (`PUBLIC_GA4_ID`,
  `PUBLIC_META_PIXEL_ID`, `PUBLIC_LINKEDIN_PARTNER_ID`): "Aceptar" guarda
  `localStorage.tk_consent = "granted"` y recién entonces inyecta los scripts de cada píxel
  configurado; "Rechazar" guarda `denied` y no carga nada.
- `src/components/LeadForm.tsx` — isla React (`client:visible`). Props: `apiUrl`, `siteKey`,
  `services: { slug: string; name: string }[]`, `defaultService?`, `landingSlug?`,
  `campaignSlug?`, `fields?` (default `["fullName","email","phone","companyName","serviceInterest","message"]`),
  `submitLabel?` (default "Quiero que me contacten"), `consentVersion` ("2026-10"). En el montaje lee
  `utm_*`, `gclid`, `fbclid` de la URL y, si `sessionStorage.tk_utm` no existe, los guarda (primer
  toque). Carga `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` y renderiza
  el widget. Casilla obligatoria: "Acepto la Política de privacidad y autorizo a Tekinsof a usar mis
  datos para atender mi solicitud (Ley N.° 29733)." con enlace a `/privacidad`. Campo honeypot
  `website` oculto con `aria-hidden` y `tabIndex={-1}`. Al enviar: `POST` JSON del §5 a `apiUrl`;
  201/200 → "¡Gracias! Te escribiremos en menos de 4 horas laborables." y
  `window.dataLayer?.push({ event: "lead_submitted" })`; 400 → errores por campo; otro → mensaje
  con enlace de WhatsApp. Todo error en texto con `role="alert"`.
- `src/pages/index.astro` — reescribe la portada provisional con `Base` y estas secciones:
  hero (h1 "Tecnología y marketing digital que hacen crecer tu empresa", subtítulo, CTA `accent`
  "Cotiza tu proyecto" → `#contacto`, CTA secundario WhatsApp, motivo de las tres barras del §7);
  `#servicios` con dos grupos (Tecnología / Marketing digital) y los 14 servicios foco como lista
  estática (nombre + una línea) — el paso 18 la reemplaza por el catálogo; "Por qué Tekinsof" con
  tres puntos (un solo equipo para tecnología y marketing; especialistas Microsoft 365, Power BI y
  Azure; respuesta en menos de 4 horas laborables); `#contacto` con `LeadForm` (servicios = la misma
  lista estática con slugs kebab-case), dirección, correo, WhatsApp y enlace a Bookings.
- `src/pages/privacidad.astro` — Política de privacidad (Ley N.° 29733 y su reglamento): responsable
  (Tekinsof Consulting, Av. Separadora Industrial Nro. 3144, Urb. Mayorazgo Etapa Tres, Lima), datos que se recogen (los del formulario y
  los de WhatsApp), finalidad (atender la solicitud y comunicaciones comerciales relacionadas),
  conservación (24 meses desde el último contacto), destinatarios (proveedores de hosting y correo
  como encargados), derechos ARCO y cómo ejercerlos (info@tekinsof.com), versión "2026-10". El texto
  final lo valida el asesor legal del cliente (§20.1).

**Files**
- `apps/web/src/styles/global.css`
- `apps/web/src/layouts/Base.astro`
- `apps/web/src/components/LeadForm.tsx`
- `apps/web/src/pages/index.astro`
- `apps/web/src/pages/privacidad.astro`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `pnpm --filter @tekinsof/web build` runs **THE SYSTEM SHALL** exit 0 and emit `dist/index.html` and `dist/privacidad.html`.
2. **WHEN** `dist/index.html` is inspected **THE SYSTEM SHALL** contain an `application/ld+json` block, a `wa.me/51959926642` link and a server-rendered form input named `fullName`.
3. **WHEN** `dist/index.html` is inspected **THE SYSTEM SHALL** contain no request to `fonts.googleapis.com`.
4. **WHEN** `dist/privacidad.html` is inspected **THE SYSTEM SHALL** contain the text `29733`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/web build
grep -q "application/ld+json" apps/web/dist/index.html
grep -q "wa.me/51959926642" apps/web/dist/index.html
grep -q 'name="fullName"' apps/web/dist/index.html
grep -q "29733" apps/web/dist/privacidad.html
status=0; grep -q "fonts.googleapis.com" apps/web/dist/index.html || status=$?; test "$status" -eq 1
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: Public site base: home, lead form with Turnstile and…"
git tag step-10-site-base

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E2-T5` — Automation: Microsoft Graph mailer, Inngest, round-robin assignment and notifications

**Depends on:** `E2-T2` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/integrations/graph.ts` — `createMailer(config)` donde
  `config = { driver: "graph" | "log"; tenantId?: string; clientId?: string; clientSecret?: string; fetchImpl?: typeof fetch }`.
  Devuelve `{ send(message): Promise<Result<void>>; getAccountEnabled(email): Promise<Result<boolean | null>>; outbox: SentMessage[] }`
  con `message = { from: string; to: string[]; subject: string; html: string; replyTo?: string; attachments?: { name: string; contentType: string; contentBase64: string }[] }`.
  - `graph`: token por client credentials (`POST https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token`,
    form `client_id`, `client_secret`, `scope=https://graph.microsoft.com/.default`,
    `grant_type=client_credentials`), cacheado hasta 60 s antes de `expires_in`. Envío:
    `POST https://graph.microsoft.com/v1.0/users/<from>/sendMail` con
    `{ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address } }], replyTo?, attachments?: [{ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType, contentBytes }] }, saveToSentItems: true }`;
    éxito solo con 202, cualquier otro estado → `err("INTERNAL", "Graph sendMail <status>")`.
    `getAccountEnabled`: `GET https://graph.microsoft.com/v1.0/users/<email>?$select=accountEnabled` →
    `ok(boolean)`; 404 → `ok(null)`.
  - `log`: no hace red; agrega el mensaje a `outbox` (arreglo en memoria del mailer) y escribe una
    línea JSON en `console.info`; `getAccountEnabled` devuelve `ok(true)`.
- `packages/core/src/automation/lead-created.ts` —
  `handleLeadCreated(db, deps, leadId): Promise<Result<{ ownerId: string | null; notified: boolean; acknowledged: boolean }>>`
  con `deps = { mailer, systemSender: string, crmBaseUrl: string, now: () => Date }`:
  1. Si el lead no existe → `NOT_FOUND`. Si ya tiene `owner_id`, no reasigna (idempotente).
  2. Elige dueño en una transacción: usuario `role='ventas'`, `is_active`, `receives_leads`, orden
     `last_assigned_at asc nulls first, id asc`, `limit 1 for update`; si no hay, el primer
     `gerencia` activo por `created_at`. Fija `leads.owner_id`, `assigned_at = now`,
     `users.last_assigned_at = now`; auditoría `lead.assigned` (`actor_id` nulo).
  3. Aviso al dueño desde `systemSender`: asunto `Nuevo lead: <fullName>`, enlace
     `<crmBaseUrl>/leads/<id>`, origen y campaña.
  4. Acuse al prospecto solo si tiene email y `source` ∈ web_form, landing: **desde el buzón del
     dueño** (si el dueño es `ventas`; si es el respaldo `gerencia`, desde `systemSender`), asunto
     "Recibimos tu consulta — Tekinsof", firmado con el nombre del dueño, con el WhatsApp
     +51 959 926 642; `replyTo` = email del dueño.
  5. Un fallo de correo **no** deshace la asignación: devuelve `notified`/`acknowledged` en false.
- `packages/core/test/lead-created.test.ts` — con mailer `log`: dos `ventas` (A sin
  `last_assigned_at`, B con ayer) y un `gerencia`; tres leads consecutivos quedan para A, B, A; volver
  a procesar el primer lead no cambia su dueño ni envía correos nuevos; el acuse del lead web sale
  con `from` = email de A y `to` = email del prospecto; con ambos vendedores inactivos el lead queda
  para el `gerencia`; con un mailer falso cuyo `send` devuelve `err`, el lead queda asignado y
  `notified` es false.
- `apps/crm/src/lib/inngest.ts` — `export const inngest = new Inngest({ id: "tekinsof-crm" })`;
  `const deps = () => ({ mailer: createMailer({ driver: env.MAIL_DRIVER, tenantId: env.GRAPH_TENANT_ID, clientId: env.GRAPH_CLIENT_ID, clientSecret: env.GRAPH_CLIENT_SECRET }), systemSender: env.GRAPH_SYSTEM_SENDER ?? "notificaciones@tekinsof.com", crmBaseUrl: env.CRM_BASE_URL, now: () => new Date() })`;
  función `inngest.createFunction({ id: "lead-created", triggers: [{ event: "lead/created" }], retries: 4 }, async ({ event, step }) => step.run("handle-lead-created", () => handleLeadCreated(getDb(), deps(), event.data.leadId)))`
  (API de Inngest v4: los triggers van en el objeto de configuración); `export const functions = [leadCreated]`.
- `apps/crm/src/app/api/inngest/route.ts` — `import { serve } from "inngest/next";`
  `export const { GET, POST, PUT } = serve({ client: inngest, functions });`

**Files**
- `packages/core/src/integrations/graph.ts`
- `packages/core/src/automation/lead-created.ts`
- `packages/core/test/lead-created.test.ts`
- `apps/crm/src/lib/inngest.ts`
- `apps/crm/src/app/api/inngest/route.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** three leads are processed with two eligible sellers A (never assigned) and B (assigned yesterday) **THE SYSTEM SHALL** assign them A, B, A in that order.
2. **WHEN** `handleLeadCreated` runs twice for the same lead **THE SYSTEM SHALL** keep the first owner and send no additional email.
3. **WHEN** a web-form lead with an email is assigned to seller A **THE SYSTEM SHALL** send the acknowledgement with `from` equal to A's email and `to` equal to the prospect's email.
4. **WHEN** no `ventas` user is active **THE SYSTEM SHALL** assign the lead to the first active `gerencia` user.
5. **WHEN** the mailer returns an error **THE SYSTEM SHALL** keep the assignment and report `notified: false`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/lead-created.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
```

Un viaje real por Inngest Cloud y Microsoft Graph necesita cuentas y red: no es un gate de build; está
en la lista de lanzamiento (§20.1).

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: Automation: Microsoft Graph mailer, Inngest, round-robin…"
git tag step-11-automation

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E2-T6` — Sweeps: business hours, SLA, reminders, quote expiry, outbox, Entra sync, site deploy

**Depends on:** `E2-T5` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/time/business-hours.ts` — con este contenido exacto (verificado en Node 24 al
  generar el blueprint con los siete vectores del test de abajo):

```ts
// Business hours for SLA and reminders: Monday–Friday 09:00–18:00 in Lima, excluding holidays.
// Peru has used a fixed UTC−05:00 offset without daylight saving since 1994, so Lima wall time is
// UTC minus 5 hours; if that ever changes, this file is the only place to update.
export const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// "YYYY-MM-DD" of the Lima calendar day containing `instant`.
export function limaDate(instant: Date): string {
  return new Date(instant.getTime() + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isBusinessDay(limaDay: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${limaDay}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(limaDay);
}

// UTC instant of `hour`:00 Lima time on the Lima day `limaDay`.
function limaHour(limaDay: string, hour: number): number {
  return Date.parse(`${limaDay}T00:00:00Z`) + hour * HOUR_MS - LIMA_OFFSET_MS;
}

function nextDay(limaDay: string): string {
  return new Date(Date.parse(`${limaDay}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// Adds `hours` of business time to `start` and returns the resulting UTC instant.
export function addBusinessHours(start: Date, hours: number, holidays: ReadonlySet<string>): Date {
  let remaining = hours * HOUR_MS;
  let cursor = start.getTime();
  let day = limaDate(start);
  for (let guard = 0; guard < 3660; guard++) {
    if (isBusinessDay(day, holidays)) {
      const open = limaHour(day, WORK_START_HOUR);
      const close = limaHour(day, WORK_END_HOUR);
      const from = Math.max(cursor, open);
      if (from < close) {
        const available = close - from;
        if (remaining <= available) return new Date(from + remaining);
        remaining -= available;
      }
    }
    day = nextDay(day);
    cursor = limaHour(day, 0);
  }
  throw new Error("addBusinessHours: no business day found within 10 years");
}
```

- `packages/core/test/business-hours.test.ts` — `addBusinessHours(new Date(<inicio>), 4, <feriados>)`
  debe devolver exactamente (todas las horas en UTC; Lima = UTC−5):

| Inicio (UTC) | Hora Lima | Feriados | Resultado esperado (UTC) |
|---|---|---|---|
| `2026-11-02T15:00:00.000Z` | lun 10:00 | — | `2026-11-02T19:00:00.000Z` |
| `2026-11-02T21:30:00.000Z` | lun 16:30 | — | `2026-11-03T16:30:00.000Z` |
| `2026-11-06T22:00:00.000Z` | vie 17:00 | — | `2026-11-09T17:00:00.000Z` |
| `2026-11-07T16:00:00.000Z` | sáb 11:00 | — | `2026-11-09T18:00:00.000Z` |
| `2026-12-07T22:00:00.000Z` | lun 17:00 | `2026-12-08`, `2026-12-09` | `2026-12-10T17:00:00.000Z` |
| `2026-11-02T12:00:00.000Z` | lun 07:00 | — | `2026-11-02T18:00:00.000Z` |
| `2026-11-02T23:30:00.000Z` | lun 18:30 | — | `2026-11-03T18:00:00.000Z` |

  Además: `limaDate(new Date("2026-11-03T03:00:00.000Z"))` → `"2026-11-02"`;
  `isBusinessDay("2026-11-07", new Set())` → `false`.
- `packages/core/src/automation/sweeps.ts` — cada función recibe `(db, deps, now: Date)` y devuelve
  `Result<{ processed: number }>`; `deps` incluye `mailer`, `systemSender`, `crmBaseUrl` y lo
  específico de cada una. Feriados = filas de `holidays`.
  - `slaSweep` — leads `status='nuevo'`, `first_contacted_at` nulo, `sla_alerted_at` nulo,
    `deleted_at` nulo, `created_at >= now - 14 días`. Para cada uno: `due = addBusinessHours(created_at, 4, feriados)`;
    fija `sla_due_at` si es nulo; si `due <= now`, envía a cada `gerencia` activo (desde
    `systemSender`) "Lead sin atender: <fullName>" con el dueño y el enlace, y fija `sla_alerted_at = now`.
  - `activityReminderSweep` — actividades con `done_at` y `reminded_at` nulos y `due_at <= now + 15 min`:
    correo al dueño y `reminded_at = now`.
  - `quoteExpirySweep` — cotizaciones `enviada`: si `valid_until < limaDate(now)` → `vencida` +
    auditoría `quote.expired`; si faltan 3 días o menos y `expiry_alerted_at` es nulo → correo al
    dueño "Cotización <number> v<version> vence el <fecha>" y `expiry_alerted_at = now`.
  - `flushOutbox(db, { send }, now)` — hasta 100 filas con `sent_at` nulo y `attempts < 10`, por
    `created_at`; `send({ name: event_name, data: payload })` OK → `sent_at = now`; error →
    `attempts + 1`, `last_error`.
  - `entraSync(db, { mailer }, now)` — usuarios activos cuyo email no termina en `@e2e.tekinsof.test`:
    `getAccountEnabled` → `false` o `null` ⇒ `is_active = false`, borra sus `sessions`, auditoría
    `user.deactivated` con `{ reason: "entra" }`; un error de Graph no desactiva a nadie.
  - `requestSitePublish(tx, { requestedBy, reason })` — inserta `site_publishes` (`pendiente`) y outbox
    `site/publish.requested` con `{ sitePublishId }` en la transacción recibida; devuelve el id.
  - `triggerSiteDeploy(db, { hookUrl, fetchImpl }, sitePublishId)` — `POST hookUrl`; 2xx → `disparado`
    y `triggered_at`; otro → `error` con el estado; sin `hookUrl` → `error` "VERCEL_DEPLOY_HOOK_URL no configurado".
  - `notifyApprovalRequested(db, deps, quoteId)` — correo a cada `gerencia` activo: "Aprobación
    pendiente: <number> v<version> (<discount_pct>% de descuento)" con enlace.
- `packages/core/test/sweeps.test.ts` — con mailer `log` y `now` fijo: un lead creado lun
  2026-11-02 10:00 Lima no se alerta con `now` = 13:59 Lima y sí con `now` = 14:01 Lima; una segunda
  corrida con el mismo `now` procesa 0; `flushOutbox` con un `send` que falla incrementa `attempts`
  y con uno que funciona fija `sent_at`; una cotización `enviada` con `valid_until` = ayer queda
  `vencida`; `requestSitePublish` deja una fila en `site_publishes` y una en `outbox`.
- `apps/crm/src/lib/inngest.ts` (editar) — agrega y exporta en `functions`: `sla-sweep`
  (`{ cron: "*/15 * * * *" }`), `activity-reminders` (`*/5 * * * *`), `quote-expiry`
  (`0 14 * * *` = 09:00 Lima), `outbox-flush` (`* * * * *`, `send` = `inngest.send`),
  `entra-sync` (`0 11 * * *` = 06:00 Lima; omitida si `MAIL_DRIVER=log`), `site-deploy`
  (`{ event: "site/publish.requested" }`, `debounce: { period: "2m" }`) y
  `quote-approval-requested` (`{ event: "quote/approval.requested" }`). Cada una envuelve su
  llamada en `step.run`.

**Files**
- `packages/core/src/time/business-hours.ts`
- `packages/core/test/business-hours.test.ts`
- `packages/core/src/automation/sweeps.ts`
- `packages/core/test/sweeps.test.ts`
- `apps/crm/src/lib/inngest.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `addBusinessHours` runs on each of the seven rows of the table above **THE SYSTEM SHALL** return exactly the expected UTC instant.
2. **WHEN** `slaSweep` runs at 13:59 Lima for a lead created Monday 10:00 Lima **THE SYSTEM SHALL** send no alert, and at 14:01 Lima SHALL email every active `gerencia` user and set `sla_alerted_at`.
3. **WHEN** `slaSweep` runs again with the same `now` **THE SYSTEM SHALL** process 0 leads.
4. **WHEN** `flushOutbox`'s `send` fails **THE SYSTEM SHALL** increment `attempts` and keep `sent_at` null.
5. **WHEN** `quoteExpirySweep` finds a sent quote whose `valid_until` was yesterday **THE SYSTEM SHALL** set its status to `vencida`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/business-hours.test.ts # expect: exit 0, 0 failed
pnpm --filter @tekinsof/core test test/sweeps.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: Sweeps: business hours, SLA, reminders, quote expiry…"
git tag step-12-sweeps

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** a lead is posted from `SITE_ORIGIN` and `handleLeadCreated` processes it **THE SYSTEM SHALL** assign it to an active seller and record one owner notification in the log mailer.
2. **WHEN** the site is built **THE SYSTEM SHALL** emit a home page whose form posts to `PUBLIC_LEADS_API_URL` with a mandatory consent checkbox.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm test:e2e
```

Run from the project root. Both criteria are decided by these commands.

## Pitfalls

- **Lima time by hand** — never use `new Date().getHours()` or the machine timezone; only `time/business-hours.ts`.
- **Dedupe window** — the 24-hour dedupe must not create an outbox row on the duplicate.
- **Acknowledgement sender** — it goes from the assigned seller's mailbox, not from `notificaciones@`, unless the fallback owner is `gerencia`.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*'` lists them.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` unchanged — every variable this epic reads was already there from the Bootstrap.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.

---

## Reference (copied from blueprint.md)

#### §4 Relationships (copy)

- users —(1:N)→ sessions, accounts — **cascade** al borrar el usuario (nunca se borra: se desactiva).
- users —(1:N)→ leads.owner_id, companies.owner_id, contacts.owner_id, audit_events.actor_id — **set null**.
- users —(1:N)→ opportunities.owner_id, activities.owner_id, quotes.owner_id — **restrict**: un
  usuario con cartera no se borra; se desactiva y Gerencia reasigna.
- companies —(1:N)→ contacts, leads, opportunities, quotes — **set null** (borrado lógico de la empresa no toca historia).
- campaigns —(1:N)→ leads, landing_pages — **set null**.
- leads —(1:0..1)→ opportunities (único parcial en `lead_id`) — **set null**.
- leads | opportunities | contacts —(1:N)→ activities — **cascade**.
- opportunities —(1:N)→ quotes — **restrict**: no se borra una oportunidad con cotizaciones.
- quotes —(1:N)→ quote_items — **cascade**. services —(1:N)→ quote_items — **set null** (el ítem conserva su descripción y precio).
- opportunities ↔ services — N:M vía opportunity_services, **cascade** en ambos lados.
- conversations —(1:N)→ messages — **cascade**. leads | contacts —(1:N)→ conversations — **set null**.

#### §5 API Design (copy)

#### Conventions

- **Interfaces internas del CRM:** server actions de Next (formularios nativos) que llaman a
  servicios de `@tekinsof/core`. No hay API REST interna. Toda server action ejecuta
  `requirePermission(<permiso>, <recurso?>)` de `src/lib/actor.ts` **antes** de cualquier trabajo.
- **Rutas HTTP:** solo las de la tabla de abajo. Base: `https://crm.tekinsof.com/api`.
- **Envoltorio de respuesta (servicios y rutas JSON), sin excepciones:**
  `{ "ok": true, "data": <T> }` · `{ "ok": false, "error": { "code": <Code>, "message": <string>, "fields"?: { [campo]: <mensaje> } } }`
- **Códigos de error y estado HTTP:** `VALIDATION_ERROR` 400 · `CAPTCHA_FAILED` 403 ·
  `ORIGIN_NOT_ALLOWED` 403 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 ·
  `CONFLICT` 409 · `INVALID_TRANSITION` 409 · `APPROVAL_REQUIRED` 409 · `INTERNAL` 500.
- **Validación:** zod en la frontera de cada servicio de core (`<servicio>Input` exportado junto a la
  función). La UI no recalcula montos ni estados; muestra lo que devuelve el servicio.
- **Paginación:** listas del CRM por offset (`?page=` 1-based, 25 filas por página, máximo 100),
  ordenadas en la base. Volumen esperado: cientos a pocos miles de filas por tabla.
- **Idempotencia:** el formulario público deduplica por `lower(email)` (o `phone` si no hay email) en
  ventanas de 24 h: el segundo envío devuelve el mismo `leadId` con `deduplicated: true` y no crea
  fila ni evento. Los handlers de Inngest son idempotentes por estado (`sla_alerted_at`,
  `reminded_at`, `expiry_alerted_at`, `assigned_at` actúan como marcas).
- **Rate limiting:** Turnstile + honeypot en el endpoint público; regla de Vercel Firewall de 20
  peticiones/min por IP sobre `/api/public/*` (configuración del dashboard, lista de lanzamiento §20.1).

#### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/health` | Liveness: `{ status: "ok", service: "crm", commit }` | público | — |
| GET, POST | `/api/auth/[...all]` | Handler de Better Auth (OAuth Microsoft, sesión, sign-out; email+password solo con `AUTH_TEST_MODE=1`) | público | límites internos de Better Auth |
| OPTIONS, POST | `/api/public/leads` | Lead desde el sitio o una landing | público con CORS a `SITE_ORIGIN` + Turnstile | 20/min/IP (Vercel Firewall) |
| GET, POST, PUT | `/api/inngest` | Endpoint de Inngest (firma verificada por el SDK con `INNGEST_SIGNING_KEY`) | firma Inngest | — |
| GET | `/api/cotizaciones/[id]/pdf` | PDF de la cotización (genera y guarda si falta) | `quotes.read` | — |

#### Critical endpoints — full detail

#### `POST /api/public/leads`

Request (`Content-Type: application/json`):

```json
{
  "fullName": "Ana Torres",
  "email": "ana@empresa.pe",
  "phone": "+51987654321",
  "companyName": "Empresa SAC",
  "serviceInterest": "desarrollo-de-software",
  "message": "Necesitamos integrar nuestro ERP",
  "consent": true,
  "consentVersion": "2026-10",
  "landingSlug": "erp-integracion-q4",
  "campaignSlug": "google-erp-q4",
  "utm": { "source": "google", "medium": "cpc", "campaign": "google-erp-q4", "term": "integracion erp", "content": "anuncio-a" },
  "gclid": "Cj0KCQ…",
  "fbclid": null,
  "referrer": "https://www.google.com/",
  "turnstileToken": "<token del widget>",
  "website": ""
}
```

Reglas de validación (zod `publicLeadInput` en `packages/core/src/leads/leads.ts`):
`fullName` 2–120 caracteres, recortado · `email` formato email, en minúsculas, opcional ·
`phone` 6–20 caracteres de `[0-9+ ()-]`, normalizado a E.164 con prefijo `+51` si llega con 9
dígitos que empiezan en 9, opcional · al menos uno de `email`/`phone` · `consent` exactamente `true` ·
`consentVersion` no vacío · `message` ≤ 2000 · `serviceInterest`, `landingSlug`, `campaignSlug`
≤ 80, kebab-case · cada campo `utm.*` ≤ 200 · `turnstileToken` no vacío · `website` (honeypot) debe
ser cadena vacía.

Respuestas:

| Caso | Estado | Cuerpo |
|---|---|---|
| Lead creado | 201 | `{ "ok": true, "data": { "leadId": "<uuid>", "deduplicated": false } }` |
| Mismo email/teléfono en las últimas 24 h | 200 | `{ "ok": true, "data": { "leadId": "<uuid existente>", "deduplicated": true } }` |
| Honeypot con contenido | 201 | `{ "ok": true, "data": { "leadId": null, "deduplicated": false } }` — no se escribe nada (no avisar al bot) |
| Validación | 400 | `{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Datos inválidos", "fields": { "email": "…" } } }` |
| Turnstile rechaza el token | 403 | `{ "ok": false, "error": { "code": "CAPTCHA_FAILED", "message": "No pudimos verificar el envío" } }` |
| `Origin` distinto de `SITE_ORIGIN` | 403 | `{ "ok": false, "error": { "code": "ORIGIN_NOT_ALLOWED", "message": "Origen no permitido" } }` |
| `OPTIONS` (preflight) | 204 | sin cuerpo; `Access-Control-Allow-Origin: <SITE_ORIGIN>`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 600` |

Efectos de un 201: en **una transacción**, una fila en `leads` (`source` = `landing` si llega
`landingSlug`, si no `web_form`; `campaign_id` resuelto por `campaignSlug` o `utm.campaign` contra
`campaigns.slug`; `sla_due_at` = `created_at` + 4 horas laborables desde el paso 12, null antes) y
una fila en `outbox` con `event_name = "lead/created"` y `payload = { "leadId": "<uuid>" }`. Tras el
commit, el handler intenta `inngest.send` del evento y marca `outbox.sent_at`; si falla, la fila
queda pendiente y el barrido del paso 12 la reenvía. El handler **nunca** devuelve 5xx por un fallo
de Inngest.

La verificación de Turnstile es `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
(form `secret`, `response`, `remoteip`) → `{ "success": boolean }`. Las claves de prueba documentadas
por Cloudflare: secreto `1x0000000000000000000000000000000AA` (siempre aprueba) y
`2x0000000000000000000000000000000AA` (siempre rechaza); site key `1x00000000000000000000AA`. Los
tests inyectan el verificador; nunca llaman a la red.

#### Server actions del CRM (contrato de servicios de core)

| Servicio (core) | Función | Permiso | Errores | Efectos |
|---|---|---|---|---|
| `users/users.ts` | `inviteUser(db, actor, { email, role })` | `users.manage` | `VALIDATION_ERROR` (email fuera de `ALLOWED_EMAIL_DOMAIN`), `CONFLICT` (invitación vigente o usuario existente) | fila `invitations` + `audit_events` `user.invited` |
| `users/users.ts` | `setUserRole`, `deactivateUser`, `reactivateUser` | `users.manage` | `FORBIDDEN` (el último gerencia activo no se degrada ni desactiva) | `audit_events` `user.role_changed` / `user.deactivated` (+ borra sus `sessions`) |
| `leads/leads.ts` | `createManualLead(db, actor, input)` | `leads.create` | `VALIDATION_ERROR` | lead `source` ∈ whatsapp, referral, manual, event, other; `owner_id` = actor si es ventas; outbox `lead/created` |
| `leads/leads.ts` | `changeLeadStatus(db, actor, { leadId, to, reason? })` | `leads.update_own` (dueño) o `leads.update_any` | `INVALID_TRANSITION`, `VALIDATION_ERROR` (descartar sin motivo) | `first_contacted_at` al pasar a `contactado`; auditoría `lead.status_changed` |
| `sales/opportunities.ts` | `convertLead`, `moveOpportunity`, `closeOpportunity`, `addActivity`, `completeActivity` | `opportunities.write_own` / `_any` | `INVALID_TRANSITION`, `CONFLICT` (lead ya convertido) | ver paso 13 |
| `sales/quotes.ts` | `createQuote`, `setQuoteItems`, `submitQuote`, `approveQuote`, `newQuoteVersion`, `markQuoteSent`, `markQuoteOutcome` | `quotes.write_own`, `quotes.approve`, `quotes.send_own` | `APPROVAL_REQUIRED`, `INVALID_TRANSITION` | ver pasos 14–16 |
| `cms/landings.ts` | `saveLanding`, `publishLanding`, `archiveLanding` | `landings.write`, `landings.publish` | `VALIDATION_ERROR` (bloques inválidos), `CONFLICT` (slug) | publicar: fila `site_publishes` + outbox `site/publish.requested` |

Transiciones de lead permitidas (cualquier otra → `INVALID_TRANSITION`):
`nuevo → contactado | descartado` · `contactado → calificado | descartado` ·
`calificado → convertido | descartado` · `descartado → nuevo` (reapertura, solo `leads.update_any`).
`convertido` solo lo fija `convertLead`.

Transiciones de cotización: `borrador → pendiente_aprobacion` (descuento > 10%) `| aprobada`
(descuento ≤ 10%) · `pendiente_aprobacion → aprobada` (solo `quotes.approve`) `| borrador` (rechazo
de Gerencia) · `aprobada → enviada` · `enviada → aceptada | rechazada | vencida` · cualquier estado
salvo `aceptada` → `reemplazada` al crear una versión nueva. Solo `borrador` admite edición de ítems.

#### Eventos de dominio (outbox → Inngest)

| Evento | Payload | Lo emite | Lo consume |
|---|---|---|---|
| `lead/created` | `{ "leadId": "<uuid>" }` | createLead, createManualLead | `lead-created` (paso 11): asigna, avisa al vendedor, acusa al prospecto |
| `quote/approval.requested` | `{ "quoteId": "<uuid>" }` | submitQuote con descuento > 10% | `quote-approval-requested` (paso 14 registra el evento; el aviso por correo a Gerencia lo envía el barrido de outbox del paso 12) |
| `site/publish.requested` | `{ "sitePublishId": "<uuid>" }` | publishLanding, cambios de publicación en el catálogo | `site-deploy` (paso 12): llama a `VERCEL_DEPLOY_HOOK_URL`, con debounce de 2 minutos |

#### Contrato de bloques de landing (`packages/core/src/cms/landings.ts`, paso 17)

`landing_pages.blocks` es un arreglo de 1 a 20 bloques. Cada bloque es exactamente una de estas
formas (unión discriminada por `type`, validada con zod al guardar y otra vez en el build del sitio):

| `type` | Campos | Límites |
|---|---|---|
| `hero` | `eyebrow?`, `title`, `subtitle`, `ctaLabel`, `ctaTarget` (`"form"` \| `"whatsapp"` \| `"bookings"`) | title ≤ 90, subtitle ≤ 220 |
| `benefits` | `title`, `items: { title, text }[]` | 2–6 ítems |
| `logos` | `title`, `names: string[]` | 1–12 nombres (texto; logos con imagen llegan en R2) |
| `testimonial` | `quote`, `author`, `role` | quote ≤ 400 |
| `faq` | `title`, `items: { question, answer }[]` | 1–10 ítems |
| `cta` | `title`, `text`, `ctaLabel`, `ctaTarget` | igual que hero |
| `form` | `title`, `submitLabel`, `fields: ("fullName"\|"email"\|"phone"\|"companyName"\|"serviceInterest"\|"message")[]`, `serviceInterest?` | `fullName` y `email` siempre presentes; un solo bloque `form` por landing |

Los mismos renderizadores (`packages/core/src/cms/blocks.tsx`) producen la vista previa del CRM y el
HTML del sitio, así lo que Marketing ve es lo que se publica.

---
