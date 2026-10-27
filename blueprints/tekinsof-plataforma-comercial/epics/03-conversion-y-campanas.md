# Epic 03: Conversión y campañas

> Después de este epic los leads calificados se convierten en oportunidades de un pipeline accesible, se cotiza con IGV y aprobación de descuentos, el PDF se envía desde Outlook, y Marketing publica landings que regeneran el sitio con el catálogo.

| | |
|---|---|
| **Epic id** | `03-conversion-y-campanas` |
| **Tasks** | `E3-T1` … `E3-T6` |
| **Depends on** | `01-fundaciones`, `02-captacion` |
| **Unlocks** | nada — es el último epic de la Release 1 |
| **Parallel with** | `E3-T5` (CMS) solo depende de `E1-T6` y `E2-T6`, y no comparte archivos con `E3-T1`…`E3-T4` |

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
  sales/opportunities.ts                      # NEW (13)
  sales/quote-math.ts · sales/quotes.ts       # NEW (14)
  catalog/services.ts                         # NEW (15)
  storage/files.ts · sales/quote-delivery.ts  # NEW (16)
  cms/landings.ts · cms/blocks.tsx            # NEW (17)
packages/core/test/opportunities · quote-math · quotes · quote-delivery · landings .test.ts   # NEW
packages/core/scripts/seed.ts                 # NEW (18)
apps/crm/src/app/(app)/oportunidades/page.tsx · oportunidades/[id]/page.tsx   # NEW (13)
apps/crm/src/components/pipeline-board.tsx    # NEW (13)
apps/crm/src/app/(app)/catalogo/page.tsx · cotizaciones/page.tsx · cotizaciones/[id]/page.tsx   # NEW (15), editor edited (16)
apps/crm/src/app/api/cotizaciones/[id]/pdf/route.ts   # NEW (16)
apps/crm/src/app/(app)/landings/page.tsx · landings/[id]/page.tsx   # NEW (17)
apps/crm/e2e/quotes.spec.ts                   # NEW (15)
apps/web/src/lib/content.ts · pages/servicios/[slug].astro · pages/lp/[slug].astro   # NEW (18)
apps/web/src/pages/index.astro                # edit (18)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `opportunities`, `opportunity_services` | stage, position, amount, owner, lead (unique), lost_reason | step 13 |
| `services` | code, slug, category, base price, is_active/is_published/is_featured | steps 15, 18 |
| `quote_sequences`, `quotes`, `quote_items` | number+version, status, currency, exchange_rate, discount_pct, totals in céntimos, validity, pdf_path | steps 14–16 |
| `landing_pages`, `campaigns`, `site_publishes` | slug, status, blocks jsonb, campaign | step 17 |
| `app_settings` | `exchange_rate_default`, `company_profile` | seeded in step 18 |

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundaciones` | `getDb`, `createTestDb`, `can`, `writeAudit`, `Result`, `authorize`, `ui.tsx` | as in their files |
| `02-captacion` | `addActivity` (`leads/activities.ts`) | adds an activity to a lead, opportunity or contact |
| `02-captacion` | `limaDate`, `addBusinessHours` (`time/business-hours.ts`) | Lima calendar day; business-hour arithmetic |
| `02-captacion` | `createMailer` (`integrations/graph.ts`) | `send` returns `Result<void>`; `log` driver records to `outbox` |
| `02-captacion` | `requestSitePublish(tx, …)` (`automation/sweeps.ts`) | inserts `site_publishes` + outbox `site/publish.requested` |
| `02-captacion` | `LeadForm` (`apps/web/src/components/LeadForm.tsx`), `Base.astro` | props documented in step 10 |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `sales/quote-math.ts` → `computeQuoteTotals`, `lineTotalCents`, `requiresApproval`, `formatAmount`, `toHundredths` | literal file in step 14 | R2 (sales, dashboard) |
| `sales/quotes.ts` → lifecycle functions | see step 14 | R2 (sales from accepted quotes) |
| `cms/landings.ts` → `blockSchema`, `landingBlocksSchema`, `listPublishedLandings` | see step 17 | step 18 (site build) |
| `cms/blocks.tsx` → `Block` | `({ block, preview? }) => JSX` | step 18 and the CRM preview |

## Conventions that bite in this area

- Money is integer céntimos end to end; the UI converts the typed decimal with `toHundredths` and shows `formatAmount` — never `parseFloat`.
- A quote that left `borrador` is immutable: changes go through `newQuoteVersion`.
- `quote-delivery.ts` uses `createElement`, not JSX; Helvetica only (no font downloads).
- The site build reads the database; an invalid published landing must fail the build naming its slug.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `.claude/rules/core-services.md`,
`.claude/rules/crm-ui.md`, `.claude/rules/site.md`. Both sit in the project root — the builder copied
them there from the bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick. Any §4, §5, §7 or §8 a task mentions is copied
verbatim under **Reference** at the end of this file — you never need `blueprint.md`.

### `E3-T1` — Pipeline: opportunities, accessible kanban, detail

**Depends on:** `E1-T6`, `E2-T2` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/sales/opportunities.ts` — exporta (zod + `Result`):
  - `createOpportunity(db, actor, { title, companyId?, contactId?, amountCents?, currency?, expectedCloseOn?, leadId?, serviceIds? })`
    — `opportunities.write_own` (dueño = actor; un `gerencia` puede pasar `ownerId`). Con `leadId`
    es una **conversión**, en una transacción: el lead debe estar `calificado` (si no,
    `INVALID_TRANSITION`) y sin oportunidad (si no, `CONFLICT`); crea la empresa desde
    `lead.company_name` si no viene `companyId` y existe nombre, y el contacto desde nombre/email/
    teléfono del lead si no hay `contact_id`; pasa el lead a `convertido` y guarda `contact_id`,
    `company_id`; inserta `opportunity_services`; auditoría `lead.converted` y `opportunity.created`.
  - `moveOpportunity(db, actor, { opportunityId, toStage, toPosition })` — solo entre etapas abiertas
    (`calificacion`, `propuesta`, `negociacion`); renumera `position` de la columna destino a
    `0…n-1` sin huecos; `opportunities.write_own`.
  - `closeOpportunity(db, actor, { opportunityId, outcome: "ganada" | "perdida", lostReason? })` —
    `perdida` exige `lostReason` (`VALIDATION_ERROR`); fija `won_at` o `lost_at`; auditoría.
  - `listOpportunitiesByStage(db, { ownerId? })` → `Record<stage, Opportunity[]>` ordenado por
    `position`; `getOpportunity(db, id)` con empresa, contacto, actividades y cotizaciones.
- `packages/core/test/opportunities.test.ts`: convertir un lead `nuevo` → `INVALID_TRANSITION`;
  convertir uno `calificado` crea oportunidad, contacto y empresa y deja el lead `convertido`; una
  segunda conversión → `CONFLICT`; un `ventas` moviendo la oportunidad de otro → `FORBIDDEN`;
  `perdida` sin motivo → `VALIDATION_ERROR`; tras mover una tarjeta a la posición 0 de una columna
  con 3 tarjetas, las posiciones son exactamente `[0, 1, 2, 3]`.
- `apps/crm/src/app/(app)/oportunidades/page.tsx` — filtro "Mías / Todas" en la URL; formulario
  "Nueva oportunidad" en `<details>` (título, empresa, lead calificado opcional, monto en decimal,
  moneda); pasa columnas y la server action `moveAction` a `PipelineBoard`.
- `apps/crm/src/components/pipeline-board.tsx` — `"use client"`; `@dnd-kit/core` + `@dnd-kit/sortable`;
  columnas Calificación, Propuesta, Negociación; tarjetas con título, empresa, monto
  (`formatAmount` del paso 14 aún no existe: usa `Intl.NumberFormat("es-PE", { minimumFractionDigits: 2 })`
  sobre `amountCents / 100`), dueño. **Alternativa de un solo puntero y teclado (WCAG 2.5.7):** cada
  tarjeta tiene botones "Mover a la etapa anterior" / "Mover a la etapa siguiente" con `aria-label`
  que incluyen el título. Error de la acción → la tarjeta vuelve y aparece un `role="alert"`.
- `apps/crm/src/app/(app)/oportunidades/[id]/page.tsx` — detalle, actividades (formulario con
  `addActivity` usando `opportunityId`), cierre ganada/perdida con motivo, lista de cotizaciones de
  la oportunidad con enlace a `/cotizaciones/<id>`.

**Files**
- `packages/core/src/sales/opportunities.ts`
- `packages/core/test/opportunities.test.ts`
- `apps/crm/src/app/(app)/oportunidades/page.tsx`
- `apps/crm/src/components/pipeline-board.tsx`
- `apps/crm/src/app/(app)/oportunidades/[id]/page.tsx`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** a `calificado` lead is converted **THE SYSTEM SHALL** create one opportunity linked to it, create its contact (and company when the lead named one) and set the lead status to `convertido`.
2. **WHEN** the same lead is converted a second time **THE SYSTEM SHALL** return `CONFLICT` and create nothing.
3. **WHEN** a `ventas` actor moves an opportunity owned by another user **THE SYSTEM SHALL** return `FORBIDDEN`.
4. **WHEN** an opportunity is closed as `perdida` without a reason **THE SYSTEM SHALL** return `VALIDATION_ERROR`.
5. **WHEN** a card is moved to position 0 of a column holding three cards **THE SYSTEM SHALL** leave that column's positions exactly `[0, 1, 2, 3]`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/opportunities.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: Pipeline: opportunities, accessible kanban, detail"
git tag step-13-pipeline

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E3-T2` — Quotes core: arithmetic and lifecycle

**Depends on:** `E2-T6`, `E3-T1` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/sales/quote-math.ts` — con este contenido exacto (verificado en Node 24 al
  generar el blueprint con los vectores del test de abajo):

```ts
// Pure quote arithmetic. All money is integer céntimos; quantities and percentages arrive as decimal
// strings with at most 2 decimals (they are numeric(…, 2) columns) and are scaled to integers before
// any multiplication, so no floating-point value ever reaches a stored amount.
export const IGV_RATE_BP = 1800; // 18.00 % in basis points
export const APPROVAL_THRESHOLD_BP = 1000; // a discount above 10.00 % needs Gerencia's approval

export type QuoteLine = { quantity: string; unitPriceCents: number };
export type QuoteTotals = {
  subtotalCents: number;
  discountCents: number;
  igvCents: number;
  totalCents: number;
};

// "12.5" → 1250 (hundredths). Rejects more than 2 decimals, signs and exponents.
export function toHundredths(value: string): number {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal: ${value}`);
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

// round(numerator / denominator), halves rounded up; both operands non-negative integers.
export function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function lineTotalCents(line: QuoteLine): number {
  return divRoundHalfUp(toHundredths(line.quantity) * line.unitPriceCents, 100);
}

export function computeQuoteTotals(lines: readonly QuoteLine[], discountPct: string): QuoteTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const discountBp = toHundredths(discountPct);
  if (discountBp > 10000) throw new Error("Discount above 100%");
  const discountCents = divRoundHalfUp(subtotalCents * discountBp, 10000);
  const taxableCents = subtotalCents - discountCents;
  const igvCents = divRoundHalfUp(taxableCents * IGV_RATE_BP, 10000);
  return { subtotalCents, discountCents, igvCents, totalCents: taxableCents + igvCents };
}

export function requiresApproval(discountPct: string): boolean {
  return toHundredths(discountPct) > APPROVAL_THRESHOLD_BP;
}

// 123456 → "1,234.56" (Peruvian invoices use comma thousands and point decimals).
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}
```

- `packages/core/test/quote-math.test.ts` — exactamente estos casos:

| Entrada | Esperado |
|---|---|
| `computeQuoteTotals([{ quantity: "1", unitPriceCents: 100000 }], "0")` | `{ subtotalCents: 100000, discountCents: 0, igvCents: 18000, totalCents: 118000 }` |
| `computeQuoteTotals([{ quantity: "2.5", unitPriceCents: 19999 }, { quantity: "1", unitPriceCents: 150000 }], "10")` | `{ subtotalCents: 199998, discountCents: 20000, igvCents: 32400, totalCents: 212398 }` |
| `computeQuoteTotals([{ quantity: "1", unitPriceCents: 100000 }], "15")` | `{ subtotalCents: 100000, discountCents: 15000, igvCents: 15300, totalCents: 100300 }` |
| `lineTotalCents({ quantity: "0.5", unitPriceCents: 333 })` | `167` |
| `requiresApproval("10.00")` / `requiresApproval("10.01")` | `false` / `true` |
| `formatAmount(123456789)` / `formatAmount(5)` | `"1,234,567.89"` / `"0.05"` |
| `lineTotalCents({ quantity: "1.234", unitPriceCents: 1 })` | lanza `Error` |

- `packages/core/src/sales/quotes.ts` — exporta (transiciones del §5):
  - `createQuote(db, actor, { opportunityId, currency, exchangeRate?, notes?, terms? })` —
    `quotes.write_own` sobre la oportunidad; número con
    `insert into quote_sequences (year, last_number) values (<año Lima>, 1) on conflict (year) do update set last_number = quote_sequences.last_number + 1 returning last_number`
    → `COT-<año>-<4 dígitos con ceros>`; `version` 1; `borrador`; `exchange_rate` = argumento o
    `app_settings.exchange_rate_default.usdToPen` o `"3.7500"`; copia `company_id`/`contact_id`/
    `owner_id` de la oportunidad.
  - `setQuoteItems(db, actor, quoteId, { discountPct, items })` — solo `borrador`
    (`INVALID_TRANSITION`); reemplaza los ítems; un ítem con `serviceId` y sin descripción o precio
    toma los del catálogo; guarda los totales de `computeQuoteTotals`.
  - `submitQuote(db, actor, quoteId)` — al menos un ítem (`VALIDATION_ERROR`); `issued_on` =
    `limaDate(now)`; `valid_until` = `issued_on` + 15 días; si `requiresApproval` →
    `pendiente_aprobacion` + outbox `quote/approval.requested`; si no → `aprobada`.
  - `approveQuote(db, actor, quoteId, { decision: "aprobar" | "rechazar" })` — `quotes.approve`;
    `pendiente_aprobacion` → `aprobada` (`approved_by`, `approved_at`) o → `borrador`.
  - `markQuoteSent(tx, quoteId, { pdfPath })`, `markQuoteOutcome(db, actor, quoteId, "aceptada" | "rechazada")`.
  - `newQuoteVersion(db, actor, quoteId)` — desde cualquier estado salvo `aceptada`/`reemplazada`:
    copia cabecera e ítems con `version + 1`, `borrador`, fechas nulas; la anterior pasa a
    `reemplazada`; auditoría `quote.versioned`.
  - `listQuotes(db, { status?, page })`, `getQuote(db, id)` con ítems, oportunidad, empresa, contacto, dueño.
- `packages/core/test/quotes.test.ts` — dos cotizaciones seguidas obtienen números que terminan en
  `-0001` y `-0002`; `setQuoteItems` sobre una `enviada` → `INVALID_TRANSITION`; `submitQuote` con
  `"10"` → `aprobada` y con `"10.01"` → `pendiente_aprobacion` más una fila de outbox
  `quote/approval.requested`; `approveQuote` por un `ventas` → `FORBIDDEN` y por un `gerencia` →
  `aprobada`; `valid_until` = `issued_on` + 15 días; `newQuoteVersion` deja v1 `reemplazada` y v2
  `borrador` con el mismo `number` y los mismos ítems.

**Files**
- `packages/core/src/sales/quote-math.ts`
- `packages/core/test/quote-math.test.ts`
- `packages/core/src/sales/quotes.ts`
- `packages/core/test/quotes.test.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `computeQuoteTotals` runs on each row of the table above **THE SYSTEM SHALL** return exactly the expected céntimos.
2. **WHEN** a quote with a 10.01% discount is submitted **THE SYSTEM SHALL** set `pendiente_aprobacion` and write one `quote/approval.requested` outbox row; with 10% it SHALL set `aprobada`.
3. **WHEN** a `ventas` actor calls `approveQuote` **THE SYSTEM SHALL** return `FORBIDDEN` and leave the status unchanged.
4. **WHEN** `setQuoteItems` targets a quote that is not `borrador` **THE SYSTEM SHALL** return `INVALID_TRANSITION`.
5. **WHEN** `newQuoteVersion` runs **THE SYSTEM SHALL** mark the old version `reemplazada` and create version 2 in `borrador` with the same number and items.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/quote-math.test.ts
pnpm --filter @tekinsof/core test test/quotes.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: Quotes core: arithmetic and lifecycle"
git tag step-14-quotes-core

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E3-T3` — Quotes UI: catalog, quote list and editor

**Depends on:** `E3-T1`, `E3-T2` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/catalog/services.ts` — `listServices(db, { activeOnly?, publishedOnly? })`
  ordenado por `category, sort_order, name`; `upsertService(db, actor, input)` (`catalog.write`;
  slug kebab-case único → `CONFLICT`); `setServicePublication(db, actor, id, { isPublished, isFeatured })`
  (`catalog.write`) que en la misma transacción llama `requestSitePublish` del paso 12 con
  `reason = "catalogo"`.
- `apps/crm/src/app/(app)/catalogo/page.tsx` — tabla por categoría (código, nombre, precio base,
  unidad, Activo, Publicado, Destacado) con formularios por fila; alta de servicio en `<details>`.
- `apps/crm/src/app/(app)/cotizaciones/page.tsx` — lista (número, versión, cliente, total con
  moneda `S/` o `US$`, estado, vigencia) con filtro por estado; formulario "Nueva cotización"
  (oportunidad abierta, moneda) → `createQuote` → redirige al editor.
- `apps/crm/src/app/(app)/cotizaciones/[id]/page.tsx` — editor: moneda, tipo de cambio, descuento %,
  filas de ítems (servicio del catálogo o "Concepto libre", descripción, cantidad, precio unitario
  en decimal `1500.00` convertido a céntimos con `toHundredths`), botones "Agregar ítem" y "Quitar"
  (submit con `name="op"`), "Guardar", "Emitir" (`submitQuote`). Panel de totales con
  `formatAmount`: **Subtotal**, **Descuento**, **IGV (18%)**, **Total**. Si está
  `pendiente_aprobacion`: badge "Pendiente de aprobación" y, solo con `quotes.approve`, botones
  "Aprobar" y "Rechazar". Botón "Nueva versión" y, si está `enviada`, "Marcar aceptada" /
  "Marcar rechazada". Los ítems solo son editables en `borrador`.
- `apps/crm/e2e/quotes.spec.ts` — (1) un `ventas` crea una oportunidad en `/oportunidades`, crea una
  cotización en PEN, agrega el concepto libre "Desarrollo a medida" 1 × `1000.00`, descuento `15`,
  emite, y ve "Pendiente de aprobación", **Subtotal** `1,000.00`, **IGV (18%)** `153.00`,
  **Total** `1,003.00`, sin botón "Aprobar"; (2) en otro contexto de navegador un `gerencia` abre la
  misma URL, pulsa "Aprobar" y ve el badge "Aprobada"; (3) en `/catalogo`, marketing marca un
  servicio como Publicado y la fila muestra "Publicado"; (4) axe sin violaciones serias en el editor.

**Files**
- `packages/core/src/catalog/services.ts`
- `apps/crm/src/app/(app)/catalogo/page.tsx`
- `apps/crm/src/app/(app)/cotizaciones/page.tsx`
- `apps/crm/src/app/(app)/cotizaciones/[id]/page.tsx`
- `apps/crm/e2e/quotes.spec.ts`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** a seller issues a PEN quote of 1 × 1000.00 with a 15% discount **THE SYSTEM SHALL** show Subtotal `1,000.00`, IGV (18%) `153.00`, Total `1,003.00` and the badge "Pendiente de aprobación".
2. **WHEN** that seller views the pending quote **THE SYSTEM SHALL** render no "Aprobar" button.
3. **WHEN** a `gerencia` user approves it **THE SYSTEM SHALL** show the badge "Aprobada".
4. **WHEN** a `marketing` user marks a catalog service as published **THE SYSTEM SHALL** show "Publicado" on that row after the redirect.
5. **WHEN** axe scans the quote editor **THE SYSTEM SHALL** report zero serious or critical violations.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/quotes.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: Quotes UI: catalog, quote list and editor"
git tag step-15-quotes-ui

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E3-T4` — Quote delivery: PDF, file storage, sending through Graph

**Depends on:** `E3-T3` · **Priority:** p0 — metadata for scope cuts, not
a running order

- `packages/core/src/storage/files.ts` — `createFileStore({ driver: "supabase" | "local", supabaseUrl?, serviceRoleKey?, bucket })`
  → `{ put(path, bytes: Uint8Array, contentType): Promise<Result<void>>; get(path): Promise<Result<Uint8Array>> }`.
  `supabase`: `createClient(url, key).storage.from(bucket).upload(path, bytes, { contentType, upsert: true })`
  y `.download(path)`. `local`: escribe bajo `<raíz del repo>/.data/files/<bucket>/<path>`, creando
  directorios.
- `packages/core/src/sales/quote-delivery.ts` — sin JSX (usa `createElement` de `react` con
  `Document`, `Page`, `View`, `Text`, `StyleSheet` y `renderToBuffer` de `@react-pdf/renderer`;
  fuente Helvetica integrada). Exporta:
  - `renderQuotePdf(data): Promise<Uint8Array>` — A4; cabecera "COTIZACIÓN <number> v<version>" en
    tinta `#1E2126` con una barra coral `#FF7F5C`; emisor desde `app_settings.company_profile`
    (`legalName`, `ruc`, `address`, `email`, `phone`; la línea de RUC se omite si está vacía);
    cliente (empresa, RUC, contacto); tabla de ítems (descripción, cantidad, precio unitario,
    importe); totales **Subtotal / Descuento (<pct>%) / IGV (18%) / Total** con `S/` o `US$` y
    `formatAmount`; si la moneda es USD, "Tipo de cambio referencial: S/ <exchange_rate> por US$ 1";
    "Válida hasta <dd/mm/aaaa>"; notas, términos y firma del vendedor (nombre y correo).
  - `ensureQuotePdf(db, { store }, quoteId)` — genera y guarda en `quotes/<number>-v<version>.pdf`
    (bucket `quotes`), fija `pdf_path`, devuelve los bytes.
  - `sendQuote(db, { store, mailer }, actor, quoteId, { to? })` — `quotes.send_own`;
    `pendiente_aprobacion` o `borrador` → `APPROVAL_REQUIRED`; otro estado distinto de `aprobada` →
    `INVALID_TRANSITION`; destinatario = email del contacto o `to` (si no hay → `VALIDATION_ERROR`);
    correo **desde el buzón del dueño** con asunto "Cotización <number> — Tekinsof", el PDF adjunto
    (`<number>-v<version>.pdf`, `application/pdf`, base64) y `replyTo` del dueño; si el envío es OK,
    en una transacción `markQuoteSent` + auditoría `quote.sent`.
- `packages/core/test/quote-delivery.test.ts` — con store `local` y mailer `log`: los bytes de
  `renderQuotePdf` empiezan con `%PDF-` y miden más de 1000 bytes; `sendQuote` sobre una
  `pendiente_aprobacion` → `APPROVAL_REQUIRED`; sobre una `aprobada` → el `outbox` del mailer tiene
  un mensaje con `from` = email del dueño y un adjunto `COT-…-v1.pdf`, la cotización queda `enviada`
  con `sent_at` no nulo y el archivo existe en el store.
- `apps/crm/src/app/api/cotizaciones/[id]/pdf/route.ts` — `GET`: `authorize("quotes.read")`
  (401/403 con el envoltorio del §5); `ensureQuotePdf`; responde los bytes con
  `Content-Type: application/pdf` y `Content-Disposition: inline; filename="<number>-v<version>.pdf"`.
- `apps/crm/src/app/(app)/cotizaciones/[id]/page.tsx` (editar) — enlace "Descargar PDF" a la ruta
  anterior y, si está `aprobada`, el formulario "Enviar al cliente" (destinatario precargado) que
  llama `sendQuote` con store y mailer construidos desde `getEnv()`.

**Files**
- `packages/core/src/storage/files.ts`
- `packages/core/src/sales/quote-delivery.ts`
- `packages/core/test/quote-delivery.test.ts`
- `apps/crm/src/app/api/cotizaciones/[id]/pdf/route.ts`
- `apps/crm/src/app/(app)/cotizaciones/[id]/page.tsx`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `renderQuotePdf` runs for an approved quote **THE SYSTEM SHALL** return bytes starting with `%PDF-` and longer than 1000 bytes.
2. **WHEN** `sendQuote` runs on a quote in `pendiente_aprobacion` **THE SYSTEM SHALL** return `APPROVAL_REQUIRED` and send nothing.
3. **WHEN** `sendQuote` runs on an `aprobada` quote **THE SYSTEM SHALL** send one email from the owner's address with the PDF attached and set the quote to `enviada` with `sent_at`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/quote-delivery.test.ts # expect: exit 0, 0 failed
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/quotes.spec.ts
```

El envío real por Graph a un buzón externo necesita la cuenta de Microsoft 365: está en la lista de
lanzamiento (§20.1).

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: Quote delivery: PDF, file storage, sending through Graph"
git tag step-16-quote-delivery

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E3-T5` — CMS: campaigns, landing blocks, editor with preview, publish

**Depends on:** `E1-T6`, `E2-T6` · **Priority:** p1 — metadata for scope cuts, not
a running order

- `packages/core/src/cms/landings.ts` — exporta:
  - `blockSchema` — la unión discriminada por `type` del §5 (*Contrato de bloques*), con sus límites
    literales; `landingBlocksSchema = z.array(blockSchema).min(1).max(20)` con un `refine` que
    rechaza más de un bloque `form` (mensaje "Solo un formulario por landing").
  - `createCampaign(db, actor, { name, slug, channel, startsOn?, endsOn?, budgetCents?, currency? })`
    (`campaigns.write`; slug duplicado → `CONFLICT`), `listCampaigns(db)`.
  - `saveLanding(db, actor, { id?, slug, title, campaignId?, seoTitle?, seoDescription?, blocks, whatsappMessage? })`
    (`landings.write`; valida bloques; slug duplicado → `CONFLICT`; `updated_by` = actor).
  - `publishLanding(db, actor, id)` (`landings.publish`; revalida bloques; `publicada`,
    `published_at`; `requestSitePublish` en la misma transacción con `reason = "landing:<slug>"`),
    `archiveLanding(db, actor, id)` (también pide regenerar el sitio).
  - `listLandings(db)`, `getLanding(db, id)`, `listPublishedLandings(db)` (con el `slug` de su campaña).
- `packages/core/src/cms/blocks.tsx` — `export function Block({ block, preview }: { block: LandingBlock; preview?: boolean })`
  que renderiza `hero`, `benefits`, `logos`, `testimonial`, `faq` (con `<details>`) y `cta` con
  clases de los tokens del §7 (`bg-surface-accent`, `bg-accent text-accent-fg`…); para `form`
  devuelve `null` salvo con `preview`, donde muestra un formulario de muestra deshabilitado con los
  campos elegidos. Los CTA renderizan `<a>` con `href` `#formulario` (`form`), `data-cta="whatsapp"`
  (el sitio lo reemplaza por el enlace de WhatsApp) o `data-cta="bookings"`.
- `packages/core/test/landings.test.ts` — un `hero` con título de 91 caracteres → `VALIDATION_ERROR`
  con la clave `blocks.0.title` en `fields`; dos bloques `form` → `VALIDATION_ERROR`; publicar como
  `marketing` deja una fila en `site_publishes` y una en `outbox`; publicar como `ventas` →
  `FORBIDDEN`; slug repetido → `CONFLICT`; `renderToStaticMarkup(createElement(Block, { block: hero }))`
  (de `react-dom/server`) contiene el título del hero.
- `apps/crm/src/app/(app)/landings/page.tsx` — `requirePermissionPage("landings.write")`; lista de
  landings (título, slug, campaña, estado, publicada el); sección "Campañas" con su formulario de
  alta; formulario "Nueva landing" (título, slug, campaña) que crea una landing con un `hero` y un
  `form` iniciales y redirige al editor.
- `apps/crm/src/app/(app)/landings/[id]/page.tsx` — editor sin JS de cliente: un `<fieldset>` por
  bloque con sus campos (`name="blocks.<i>.<campo>"`), botones submit `name="op"` para "Subir",
  "Bajar", "Quitar" y "Agregar bloque" (con `<select>` de tipo), "Guardar", "Publicar" y "Archivar";
  a la derecha, la vista previa con `<Block preview>` por bloque. Errores de validación junto al campo.

**Files**
- `packages/core/src/cms/landings.ts`
- `packages/core/src/cms/blocks.tsx`
- `packages/core/test/landings.test.ts`
- `apps/crm/src/app/(app)/landings/page.tsx`
- `apps/crm/src/app/(app)/landings/[id]/page.tsx`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** a landing is saved with a hero title longer than 90 characters **THE SYSTEM SHALL** return `VALIDATION_ERROR` with the field key `blocks.0.title`.
2. **WHEN** a landing contains two `form` blocks **THE SYSTEM SHALL** reject it with `VALIDATION_ERROR`.
3. **WHEN** a `marketing` user publishes a valid landing **THE SYSTEM SHALL** set it `publicada` and write one `site_publishes` row and one `site/publish.requested` outbox row.
4. **WHEN** a `ventas` user tries to publish **THE SYSTEM SHALL** return `FORBIDDEN`.
5. **WHEN** a hero block is rendered with `Block` **THE SYSTEM SHALL** emit HTML containing its title.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @tekinsof/core test test/landings.test.ts
pnpm typecheck
pnpm lint
pnpm --filter @tekinsof/crm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: CMS: campaigns, landing blocks, editor with preview, publish"
git tag step-17-cms-landings

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

### `E3-T6` — Dynamic site: catalog-driven service pages, landings, seed

**Depends on:** `E2-T4`, `E3-T5` · **Priority:** p1 — metadata for scope cuts, not
a running order

- `packages/core/scripts/seed.ts` — `node scripts/seed.ts` (carga `<raíz>/.env` con
  `process.loadEnvFile` si existe, usa `createDb(process.env.DATABASE_URL)` de `../src/db/client.ts`).
  Idempotente: `services` por `code` (`on conflict do update` de nombre, slug, categoría, summary,
  `is_published`, `is_featured`, `sort_order`), `holidays` por `date` (`do nothing`),
  `app_settings` por `key` (`do nothing`): `exchange_rate_default` = `{ "usdToPen": "3.7500" }` y
  `company_profile` = `{ "legalName": "Tekinsof Consulting", "ruc": "", "address": "Av. La Molina 145, Ate, Lima", "email": "info@tekinsof.com", "phone": "+51 981 053 022" }`.
  Si `SEED_DEMO === "1"`: campaña `demo-google` (`google_ads`) y landing publicada
  `demo-desarrollo-software` ("Desarrollo de software a medida") con bloques `hero`, `benefits`
  (3 ítems), `faq` (2 ítems) y `form` (`fullName`, `email`, `phone`, `companyName`, `message`;
  `serviceInterest` = `desarrollo-de-software`). Catálogo (summary = una oración descriptiva por
  servicio; `body` vacío; precio base 0):

| code | name | slug | category | publicado | destacado |
|---|---|---|---|---|---|
| SW-DEV | Desarrollo de Software | desarrollo-de-software | tecnologia | sí | sí |
| WEB-APP | Aplicaciones Web a Medida | aplicaciones-web-a-medida | tecnologia | sí | sí |
| MOB-APP | Aplicaciones Móviles | aplicaciones-moviles | tecnologia | sí | no |
| ERP-INT | Integración ERP | integracion-erp | tecnologia | sí | sí |
| CRM-INT | Integración CRM | integracion-crm | tecnologia | sí | sí |
| API-ENT | APIs Empresariales | apis-empresariales | tecnologia | sí | no |
| PROC-AUT | Automatización de Procesos | automatizacion-de-procesos | tecnologia | sí | sí |
| M365 | Microsoft 365 | microsoft-365 | tecnologia | sí | sí |
| BI-PBI | Power BI y Analítica | power-bi-y-analitica | tecnologia | sí | sí |
| BIG-DATA | Big Data | big-data | tecnologia | sí | sí |
| INFRA | Infraestructura Tecnológica | infraestructura-tecnologica | tecnologia | sí | sí |
| AZURE | Azure | azure | tecnologia | sí | no |
| AWS | AWS | aws | tecnologia | sí | no |
| SEC | Ciberseguridad | ciberseguridad | tecnologia | sí | sí |
| AI-BIZ | Inteligencia Artificial aplicada a negocios | inteligencia-artificial-para-negocios | tecnologia | sí | sí |
| HELPDESK | Mesa de Ayuda | mesa-de-ayuda | tecnologia | **no** | no |
| OUTSRC | Outsourcing TIC | outsourcing-tic | tecnologia | **no** | no |
| EQUIP | Equipamiento Tecnológico | equipamiento-tecnologico | tecnologia | **no** | no |
| LIC | Licenciamiento de Software | licenciamiento-de-software | tecnologia | **no** | no |
| MKT-DIG | Marketing Digital | marketing-digital | marketing | sí | sí |
| BRAND | Branding Corporativo | branding-corporativo | marketing | sí | sí |
| BRAND-DES | Diseño de Marca | diseno-de-marca | marketing | sí | no |
| SEO | SEO | seo | marketing | sí | no |
| GADS | Google Ads | google-ads | marketing | sí | no |
| FBADS | Facebook Ads | facebook-ads | marketing | sí | no |
| IGADS | Instagram Ads | instagram-ads | marketing | sí | no |
| TTADS | TikTok Ads | tiktok-ads | marketing | sí | no |
| LIADS | LinkedIn Ads | linkedin-ads | marketing | sí | no |
| MKT-AUT | Automatización de Marketing | automatizacion-de-marketing | marketing | sí | no |
| COM-AUT | Automatización Comercial | automatizacion-comercial | marketing | sí | sí |
| WA-BIZ | WhatsApp Business | whatsapp-business | marketing | sí | sí |
| BOTS | Chatbots IA | chatbots-ia | marketing | sí | no |
| EMAIL | Email Marketing | email-marketing | marketing | sí | no |
| GROWTH | Growth Marketing | growth-marketing | marketing | sí | no |
| LEADGEN | Generación de Leads | generacion-de-leads | marketing | sí | no |

  Feriados (Perú; se verifican contra el calendario oficial antes del lanzamiento, §20.1):
  2026 — 01-01 Año Nuevo · 04-02 Jueves Santo · 04-03 Viernes Santo · 05-01 Día del Trabajo ·
  06-07 Batalla de Arica y Día de la Bandera · 06-29 San Pedro y San Pablo · 07-23 Día de la Fuerza
  Aérea del Perú · 07-28 y 07-29 Fiestas Patrias · 08-06 Batalla de Junín · 08-30 Santa Rosa de
  Lima · 10-08 Combate de Angamos · 11-01 Todos los Santos · 12-08 Inmaculada Concepción ·
  12-09 Batalla de Ayacucho · 12-25 Navidad. 2027 — las mismas fechas fijas y 03-25 Jueves Santo,
  03-26 Viernes Santo.
- `apps/web/src/lib/content.ts` — usa `getDb()` de `@tekinsof/core/db/client` (en build, con el
  `DATABASE_URL` cargado por `astro.config.mjs`): `getPublishedServices()`, `getFeaturedServices()`
  (agrupados por categoría) y `getPublishedLandings()` (valida `blocks` con `landingBlocksSchema`; una
  landing inválida **rompe el build** con un error que nombra su slug).
- `apps/web/src/pages/servicios/[slug].astro` — `getStaticPaths` desde `getPublishedServices()`;
  `Base` con `seoTitle ?? "<name> | Tekinsof Consulting"` y canonical
  `https://tekinsof.com/servicios/<slug>`; h1 = nombre, resumen, párrafos de `body`, JSON-LD
  `@type: "Service"` (`provider` = la organización), `LeadForm` con `defaultService = slug`.
- `apps/web/src/pages/lp/[slug].astro` — `getStaticPaths` desde `getPublishedLandings()`; `Base` con
  `noindex`; cada bloque con `<Block block={b} />` y, en lugar del bloque `form`, un
  `<section id="formulario">` con `<LeadForm client:visible landingSlug campaignSlug fields submitLabel …/>`;
  los `data-cta="whatsapp"` se convierten en el enlace de WhatsApp con `whatsappMessage`.
- `apps/web/src/pages/index.astro` (editar) — la lista estática de servicios del paso 10 se reemplaza
  por `getFeaturedServices()` (tarjetas que enlazan a `/servicios/<slug>`) y el `<select>` del
  formulario por `getPublishedServices()`.

**Files**
- `packages/core/scripts/seed.ts`
- `apps/web/src/lib/content.ts`
- `apps/web/src/pages/servicios/[slug].astro`
- `apps/web/src/pages/lp/[slug].astro`
- `apps/web/src/pages/index.astro`

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `pnpm db:seed` runs twice on the migrated `.data/dev` database **THE SYSTEM SHALL** exit 0 both times (the unique `services.code` index makes a duplicate impossible).
2. **WHEN** the site is built after seeding **THE SYSTEM SHALL** emit `dist/servicios/desarrollo-de-software.html` and SHALL NOT emit `dist/servicios/mesa-de-ayuda.html` (unpublished).
3. **WHEN** the demo landing is published **THE SYSTEM SHALL** emit `dist/lp/demo-desarrollo-software.html` containing a `noindex` robots meta tag.
4. **WHEN** the sitemap is generated **THE SYSTEM SHALL** list `/servicios/desarrollo-de-software` and no `/lp/` URL.
5. **WHEN** the home page is built **THE SYSTEM SHALL** link to `/servicios/desarrollo-de-software`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm --filter @tekinsof/web build
test -f apps/web/dist/servicios/desarrollo-de-software.html
status=0; test -f apps/web/dist/servicios/mesa-de-ayuda.html || status=$?; test "$status" -eq 1
grep -q 'name="robots" content="noindex' apps/web/dist/lp/demo-desarrollo-software.html
grep -q "servicios/desarrollo-de-software" apps/web/dist/sitemap-0.xml
status=0; grep -q "/lp/" apps/web/dist/sitemap-0.xml || status=$?; test "$status" -eq 1
grep -q 'href="/servicios/desarrollo-de-software"' apps/web/dist/index.html
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T6: Dynamic site: catalog-driven service pages, landings, seed"
git tag step-18-site-dynamic

```

Run both after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target and the thing the build's final gate counts.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** the full gate runs after this epic **THE SYSTEM SHALL** pass `pnpm test`, `pnpm build` and `pnpm test:e2e` including the quote approval flow.
2. **WHEN** the site is built after `pnpm db:seed` **THE SYSTEM SHALL** emit one page per published service and no page for unpublished services.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm db:migrate && pnpm db:seed
pnpm build
pnpm test:e2e
```

Run from the project root. Both criteria are decided by these commands.

## Pitfalls

- **Approval bypass** — hiding the "Aprobar" button is not enough; `approveQuote` checks `quotes.approve` itself.
- **Kanban only by mouse** — the previous/next buttons are the WCAG 2.5.7 alternative and must call the same action.
- **Site build against an empty database** — run `pnpm db:migrate && pnpm db:seed` before `pnpm --filter @tekinsof/web build` locally.

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

#### §7 Design System (copy)

Derivado del logo actual de Tekinsof (colores muestreados del archivo `teklogo` del sitio vigente) y
aprobado por el cliente. `ui-ux-pro-max` no estaba disponible en la sesión de diseño; se usó
`knowledge/capabilities/styling.md` con valores literales. Los tokens se definen **una vez** en
`apps/crm/src/app/globals.css` (paso 1) y se replican idénticos en `apps/web/src/styles/global.css`
(paso 10).

#### Colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--primary` | `#1E2126` (tinta) | `#ECEDEE` | botones primarios del CRM, navegación activa |
| `--primary-fg` | `#FFFFFF` | `#121417` | texto sobre primary |
| `--accent` | `#FF7F5C` (coral del logo) | `#FF7F5C` | CTA del sitio ("Cotiza", "Escríbenos"), énfasis puntual |
| `--accent-fg` | `#1E2126` | `#121417` | texto sobre accent — **nunca blanco** |
| `--link` / `--focus` | `#C2452A` (coral profundo) | `#FF9C80` | enlaces, anillo de foco |
| `--background` | `#FFFFFF` | `#121417` | página |
| `--surface` | `#F7F7F8` | `#1E2126` | tarjetas, paneles, cabecera de tablas |
| `--surface-accent` | `#E7DBE7` (lila del logo) | `#2C2530` | bandas de sección, chips, badges suaves |
| `--border` | `#E2E3E7` | `#2E323A` | divisores, bordes de inputs |
| `--fg` | `#1E2126` | `#ECEDEE` | texto |
| `--fg-muted` | `#5B606B` | `#A3A8B3` | texto secundario |
| `--destructive` | `#B42318` | `#F97066` | errores, eliminar, SLA vencido |
| `--success` | `#067647` | `#47CD89` | confirmaciones, etapa ganada |
| `--warning` | `#B54708` | `#FDB022` | SLA por vencer, cotización por vencer |

**Contraste (WCAG 2.2 AA), medido con la fórmula de luminancia relativa:** `#FF7F5C` con texto
`#1E2126` → **6.5:1** (el blanco sobre coral daría 2.6:1 y está prohibido); `#C2452A` sobre `#FFFFFF`
→ **5.0:1**; `#5B606B` sobre `#FFFFFF` → **6.3:1**; `#A3A8B3` sobre `#121417` → **7.8:1**;
`#B42318` sobre `#FFFFFF` → **6.6:1**.

#### Typography

| Role | Family | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Display (hero del sitio) | Plus Jakarta Sans Variable | 48px / 56px (móvil 34px / 40px) | 700 | -0.02em |
| Heading | Plus Jakarta Sans Variable | h1 32/40 · h2 24/32 · h3 20/28 | 700 / 600 | -0.01em |
| Body | Inter Variable | 16px / 24px (CRM denso: 14px / 20px en tablas) | 400, 500 para etiquetas | 0 |
| Números (montos, KPIs) | Inter Variable con `font-variant-numeric: tabular-nums` | igual que body | 500 | 0 |
| Mono (códigos, IDs) | `ui-monospace, SFMono-Regular, Consolas, monospace` | 13px / 20px | 400 | 0 |

**Carga de fuentes:** auto-alojadas con `@fontsource-variable/inter` y
`@fontsource-variable/plus-jakarta-sans`, importadas en el CSS global (sin peticiones a Google
Fonts). Familias de respaldo: `ui-sans-serif, system-ui, "Segoe UI", sans-serif`. Las caras de
Fontsource declaran `font-display: swap`.

#### Spacing, radius, elevation

- Espaciado: base 4px — rampa 4, 8, 12, 16, 24, 32, 48, 64, 96 (utilidades por defecto de Tailwind;
  sin valores arbitrarios).
- Radio: `--radius-control` 10px (botones, inputs, chips) · `--radius-card` 14px (tarjetas, diálogos) · avatares `9999px`.
- Sombras: CRM plano con bordes (`1px solid var(--border)`); diálogos `0 10px 30px rgb(18 20 23 / 0.18)`;
  tarjetas del sitio al pasar el mouse `0 6px 20px rgb(18 20 23 / 0.10)`.
- Ancho máximo: sitio 1200px de contenido (texto largo 72ch); CRM fluido con barra lateral de 248px
  (colapsa a cajón bajo 1024px).
- Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 — diseño móvil primero.

#### Motion

- Duraciones: 120ms (hover, foco), 180ms (abrir menús, toasts), 240ms (diálogos, cajón móvil).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` de entrada; `cubic-bezier(0.4, 0, 1, 1)` de salida.
- Solo `transform` y `opacity`. Arrastre del kanban: la tarjeta se eleva con sombra de diálogo.
- `prefers-reduced-motion: reduce` anula animaciones y transiciones (regla global en `globals.css`).

#### Component style

Corporativo-tecnológico en la línea de Microsoft y WorkOS: mucho aire en el sitio, densidad útil en
el CRM, superficies planas con bordes finos y un solo acento coral por pantalla (el CTA). El motivo
gráfico de la marca son **tres barras inclinadas** (tinta, coral, lila) del logo, usadas como
separador de sección y fondo del hero, nunca como decoración en el CRM. Si un componente nuevo
necesita un color que no está en la tabla, el componente está mal, no la tabla.

---
