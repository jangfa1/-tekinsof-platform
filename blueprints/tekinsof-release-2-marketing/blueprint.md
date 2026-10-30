# Plataforma Comercial Tekinsof — Release 2, fase 1: Captación pagada y Dashboard — Blueprint

> Blueprint **ejecutable**. Hereda todo el método de la Release 1
> (`blueprints/tekinsof-plataforma-comercial/blueprint.md`: §9 "The rules of a step", convenciones
> de §4 y §5, gate estándar). El diseño completo de la Release 2 vive en `design.md`; este
> documento construye solo la fase que Tekinsof priorizó el 2026-10-30.

---

## 1. Alcance

### Prioridades aprobadas por Tekinsof (2026-10-30)

1. Facebook Lead Ads.
2. Instagram Lead Ads.
3. TikTok Lead Ads.
4. Google Lead Forms.
5. Landing pages optimizadas para campañas.
6. Dashboard de marketing.

### Non-Goals de esta fase

| No se construye | Qué sí se deja preparado |
|---|---|
| Multi-tenant completo (filtrado por organización, RLS, login de otras empresas) | Tabla `organizations` y `organization_id` con valor por defecto en las tablas de negocio (paso r2-01) |
| WhatsApp Business API | Tablas `conversations`/`messages` de R1 sin cambios; `integration_accounts.provider` admite agregar `whatsapp` |
| Bot IA, calificación con IA | Nada en esta fase |
| Constructor de formularios | Las landings siguen usando el bloque `form` de R1 |
| Crear o pausar anuncios en las plataformas | Solo se leen leads y gasto |

**Cambio respecto de R1:** el Dashboard de marketing era Non-Goal de R1 con el disparador "R1 en
verde + 4 semanas de leads reales". Tekinsof lo aprueba ahora; el dashboard se construye al final
(r2-11, r2-12), cuando ya hay leads de anuncios entrando.

### Decisiones de diseño

- **Instagram = Meta.** Los leads de Instagram llegan por la misma suscripción `leadgen` de la
  Página de Facebook. Un solo adaptador; `leads.ad_platform` guarda `facebook` o `instagram` según
  el campo `platform` del lead (`fb`/`ig`).
- **Webhooks sin lógica.** Verifican la firma, guardan `inbound_events` + `outbox`
  (`inbound/received`) en una transacción y responden 200. El procesamiento corre en la función
  Inngest `process-inbound` con reintentos.
- **Credenciales cifradas.** Tokens y claves de webhook en `integration_accounts` / `ad_forms`
  cifrados con AES-256-GCM (`INTEGRATIONS_ENCRYPTION_KEY`); nunca en texto plano ni en logs.
- **Meta: token de usuario del sistema.** El administrador pega en el CRM un token de *System
  User* del Business Manager (no expira y no requiere flujo OAuth en el CRM). El OAuth queda para
  la fase SaaS.
- **TikTok: contrato propio firmado.** El formato del webhook oficial no se pudo verificar al
  diseñar (ver `design.md` §5.2). El endpoint acepta un JSON normalizado firmado con HMAC
  (`X-Tekinsof-Signature`), que alimentan LeadsBridge/Zapier hoy, y el adaptador oficial se agrega
  detrás de la misma función cuando se conecte la cuenta.
- **`leads.ts` no crece** (299 líneas). La ingesta externa vive en `packages/core/src/capture/`.

---

## 2. Modelo de datos (cambios)

Todas las convenciones de R1 §4. Todas las tablas nuevas llevan `organization_id`.

### organizations (nueva)

`id` uuid PK · `name` · `slug` unique · `legal_name` · `ruc` · `timezone` default `America/Lima`
· `locale` default `es-PE` · `status` ∈ activa, suspendida · `settings jsonb` · timestamps.
El seed inserta la organización Tekinsof con el id fijo `DEFAULT_ORGANIZATION_ID`
(`00000000-0000-4000-8000-000000000001`, exportado por `schema.ts`).

### organization_id en tablas de negocio

`companies`, `contacts`, `campaigns`, `leads`, `opportunities`, `activities`, `services`,
`quotes`, `landing_pages`, `conversations` y las tablas nuevas: `uuid not null default
DEFAULT_ORGANIZATION_ID`. **Sin FK ni índice en esta fase**: ningún servicio filtra todavía por
organización. F8 agrega la FK (`not valid` + `validate`), los índices compuestos, el filtrado en
servicios y RLS. Un test de arquitectura impide crear una tabla de negocio sin la columna.

### integration_accounts (nueva)

`provider` ∈ meta, tiktok, google_ads · `external_account_id` (id de la Página, del anunciante o
del cliente de Google Ads) · `display_name` · `status` ∈ conectada, expirada, revocada, error
(default conectada) · `credentials_encrypted` text (sobre `v1:<iv>:<tag>:<datos>` en base64url) ·
`key_version` int · `token_expires_at` · `connected_by` → users (set null) · `last_ok_at` ·
`last_error` · timestamps. Único (organization_id, provider, external_account_id).

### inbound_events (nueva)

`provider` ∈ meta, tiktok, google_ads · `event_type` · `external_id` · `payload jsonb` ·
`signature_valid` bool · `status` ∈ recibido, procesado, ignorado, error (default recibido) ·
`attempts` int default 0 · `error` · `received_at` · `processed_at`. Único (provider,
external_id); índice (status, received_at). Retención de 90 días (purga en r2-08).

### ad_forms (nueva)

`provider` · `external_form_id` · `name` · `campaign_id` → campaigns (set null) ·
`integration_account_id` → integration_accounts (set null) · `field_mapping jsonb` default `{}`
(clave del proveedor → campo del lead) · `consent_text` · `webhook_key_encrypted` (Google) ·
`is_active` default true · timestamps. Único (organization_id, provider, external_form_id).

### campaign_spend_daily (nueva)

`campaign_id` → campaigns (cascade) · `provider` ∈ meta, tiktok, google_ads, manual · `date` ·
`spend_cents` bigint ≥ 0 · `currency` ∈ PEN, USD · `impressions`, `clicks`, `platform_leads` int ·
timestamps. Único (campaign_id, provider, date).

### campaigns (+)

`external_refs jsonb not null default {}`: ids de campaña por plataforma,
`{ "meta": ["1202…"], "google_ads": ["2134…"], "tiktok": ["17…"] }`.

### leads (+)

| Campo | Tipo | Notas |
|---|---|---|
| `external_lead_id` | text | id del lead en la plataforma; único parcial con `source` |
| `ad_form_id` | uuid → ad_forms (set null) | |
| `ad_id`, `adset_id` | text | |
| `ad_platform` | text, check ∈ facebook, instagram, tiktok, google o null | |
| `ttclid` | text | click id de TikTok |
| `raw_answers` | jsonb default `{}` | respuestas que no mapean a un campo |
| `is_test` | boolean default false | leads de prueba de las plataformas: no se asignan ni cuentan |

`ck_leads_source` suma `meta_lead_ads`, `tiktok_lead_ads`, `google_lead_form`.
`ck_leads_public_consent` exige `consent_at` también para esas tres fuentes (la plataforma muestra
la política de privacidad en su formulario; `consent_at` = hora de envío).

---

## 3. APIs

| Método | Ruta | Para qué | Autenticación |
|---|---|---|---|
| GET | `/api/webhooks/meta` | Verificación de la suscripción | `hub.mode=subscribe` + `hub.verify_token` = `META_VERIFY_TOKEN` → responde `hub.challenge` en texto |
| POST | `/api/webhooks/meta` | `leadgen` de la Página (Facebook e Instagram) | `X-Hub-Signature-256: sha256=<hmac>` del cuerpo crudo con `META_APP_SECRET` |
| POST | `/api/webhooks/google-leads/:adFormId` | Google Ads Lead Form | `google_key` del cuerpo = clave del `ad_form` |
| POST | `/api/webhooks/tiktok` | Leads de TikTok (contrato normalizado) | `X-Tekinsof-Signature: sha256=<hmac>` con `TIKTOK_WEBHOOK_SECRET` |

Respuestas: 200 `{ ok: true, data: { inboundEventId, duplicate } }`; firma inválida → 401
`UNAUTHENTICATED`; cuerpo inválido → 400 `VALIDATION_ERROR`. Nunca 5xx por errores de negocio.

**Eventos nuevos (outbox → Inngest):** `inbound/received` `{ inboundEventId }` → `process-inbound`.
Crons: `meta-leads-backfill` (cada hora), `inbound-purge` (diario), `spend-sync` (diario 11:00 UTC).

**Permisos nuevos** (`permissions.ts`): `integrations.manage` (gerencia), `dashboard.marketing`
(gerencia, marketing). `campaigns.write` cubre el mapeo de formularios y el gasto manual.

**Variables de entorno nuevas** (en `env.ts` con valor local por defecto; obligatorias en
producción): `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes en base64), `META_APP_SECRET`,
`META_VERIFY_TOKEN`, `META_GRAPH_VERSION` (default `v24.0`), `TIKTOK_WEBHOOK_SECRET`. Sitio:
`PUBLIC_TIKTOK_PIXEL_ID` (opcional).

---

## 4. Build order

Mismas reglas que R1 §9: máximo 5 archivos por paso (un glob de salida generada cuenta como uno),
2–6 criterios EARS, `Verify` literal desde la raíz bajo `set -e`, checkpoint
`git commit -m "r2 step NN: slug"` + `git tag r2-step-NN-slug`, nunca saltar adelante. Gate
estándar en cada paso: `pnpm typecheck && pnpm lint && pnpm test`.

| # | Paso | Depende de | Gate principal |
|---|---|---|---|
| r2-01 | foundation-schema — organizaciones, tablas de captación, columnas de leads | R1 | `test/schema-r2.test.ts` |
| r2-02 | capture-core — cifrado, `inbound_events`, `ingestExternalLead` | r2-01 | `test/external-leads.test.ts` |
| r2-03 | meta-adapter — firma, parseo del webhook, consulta del lead (FB + IG) | r2-02 | `test/meta.test.ts` |
| r2-04 | meta-webhook — ruta, env, función `process-inbound` | r2-03 | `e2e/webhooks-meta.spec.ts` |
| r2-05 | google-lead-forms — adaptador y ruta | r2-04 | `e2e/webhooks-google.spec.ts` |
| r2-06 | tiktok-leads — adaptador y ruta | r2-04 | `e2e/webhooks-tiktok.spec.ts` |
| r2-07 | integrations-ui — cuentas, formularios, claves de Google | r2-05, r2-06 | `e2e/integrations.spec.ts` |
| r2-08 | meta-backfill — recuperación horaria, salud de tokens, purga | r2-07 | `test/backfill.test.ts` |
| r2-09 | landing-tracking — ttclid, eventos de conversión con consentimiento, píxel de TikTok | r2-01 | build del sitio + greps |
| r2-10 | campaign-spend — gasto manual y sincronización de Meta | r2-07 | `test/spend.test.ts` |
| r2-11 | dashboard-core — indicadores, embudo, CPL | r2-10 | `test/dashboard.test.ts` |
| r2-12 | dashboard-ui — `/marketing` | r2-11 | `e2e/marketing.spec.ts` |

---

#### Step r2-01 — Foundation schema

**Do**
- `packages/core/src/db/schema.ts`: `DEFAULT_ORGANIZATION_ID`; tabla `organizations`; helper
  `organizationId()` aplicado a las 10 tablas de negocio de R1; tablas `integration_accounts`,
  `inbound_events`, `ad_forms`, `campaign_spend_daily`; `campaigns.external_refs`; columnas
  nuevas de `leads` y checks actualizados (§2).
- `pnpm db:generate` → `packages/core/drizzle/**`.
- `packages/core/scripts/seed.ts`: inserta la organización por defecto (idempotente).
- `packages/core/test/schema-r2.test.ts`.

**Done when**
- [ ] WHEN `pnpm --filter @tekinsof/core test test/schema-r2.test.ts` runs THE SYSTEM SHALL find the tables `organizations`, `integration_accounts`, `inbound_events`, `ad_forms` and `campaign_spend_daily` after applying every migration to an in-memory PGlite.
- [ ] WHEN the same test inspects `information_schema.columns` THE SYSTEM SHALL find a non-null `organization_id` column on every table in its `businessTables` array, and a row inserted into `leads` without it SHALL get `DEFAULT_ORGANIZATION_ID`.
- [ ] WHEN a `leads` row with `source = 'meta_lead_ads'` and no `consent_at` is inserted THE SYSTEM SHALL reject it with a check-constraint error.
- [ ] WHEN two `leads` rows share `source = 'google_lead_form'` and the same `external_lead_id` THE SYSTEM SHALL reject the second with a unique violation, and two rows with null `external_lead_id` SHALL both be accepted.
- [ ] WHEN `pnpm db:migrate` runs twice and `pnpm db:seed` runs twice against `.data/dev` THE SYSTEM SHALL exit 0 every time.

**Verify**
```bash
pnpm db:generate
pnpm --filter @tekinsof/core test test/schema-r2.test.ts
pnpm --filter @tekinsof/core test test/schema.test.ts
pnpm db:migrate
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `git commit -m "r2 step 01: foundation-schema"` · `git tag r2-step-01-foundation-schema`

---

#### Step r2-02 — Capture core

**Do**
- `packages/core/src/integrations/secrets.ts`: `encryptSecret(plain, key)`, `decryptSecret(sealed,
  key)` con AES-256-GCM de `node:crypto`; sobre `v1:<iv>:<tag>:<datos>`; `parseEncryptionKey(base64)`
  exige 32 bytes.
- `packages/core/src/capture/inbound.ts`: `recordInboundEvent(db, { provider, eventType,
  externalId, payload, signatureValid })` → inserta `inbound_events` + outbox `inbound/received` en
  una transacción; si `(provider, external_id)` ya existe devuelve `{ duplicate: true }` sin outbox.
  `markInbound(db, id, status, error?)`.
- `packages/core/src/capture/external-leads.ts`: tipo `ExternalLead` (provider, externalLeadId,
  externalFormId, campaignExternalId, adId, adsetId, adPlatform, fullName, email, phone,
  companyName, jobTitle, message, rawAnswers, submittedAt, isTest) e `ingestExternalLead(db, lead)`:
  - valida con zod (al menos email o teléfono; normaliza el teléfono con `normalizePhonePe`);
  - idempotente por (source, external_lead_id) → `{ leadId, duplicate: true }`;
  - crea el `ad_form` desconocido (sin mapear) y resuelve la campaña: primero
    `ad_forms.campaign_id`, si no `campaigns.external_refs` contiene el id de campaña externo;
  - inserta el lead con `consent_at = submittedAt` y outbox `lead/created`, salvo `isTest`, que
    se guarda sin outbox.
- Tests: `test/secrets.test.ts`, `test/external-leads.test.ts`.

**Done when**
- [ ] WHEN a secret is encrypted and decrypted with the same key THE SYSTEM SHALL return the original text, and decrypting with another key or a tampered envelope SHALL return `{ ok: false }` instead of throwing.
- [ ] WHEN `recordInboundEvent` is called twice with the same provider and external id THE SYSTEM SHALL keep one `inbound_events` row and one `inbound/received` outbox row, and report `duplicate: true` the second time.
- [ ] WHEN `ingestExternalLead` receives a Meta lead whose external campaign id is listed in a campaign's `external_refs.meta` THE SYSTEM SHALL create one lead with that `campaign_id`, `source = 'meta_lead_ads'`, a non-null `consent_at` and one `lead/created` outbox row.
- [ ] WHEN the same external lead is ingested again THE SYSTEM SHALL return the first `leadId` with `duplicate: true` and write no new lead or outbox row.
- [ ] WHEN a lead has `isTest = true` THE SYSTEM SHALL store it with `is_test = true` and write no `lead/created` outbox row.
- [ ] WHEN a lead has neither email nor phone THE SYSTEM SHALL return `VALIDATION_ERROR` and write nothing.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/secrets.test.ts
pnpm --filter @tekinsof/core test test/external-leads.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 02: capture-core` · `r2-step-02-capture-core`

---

#### Step r2-03 — Meta adapter (Facebook + Instagram)

**Do**
- `packages/core/src/integrations/meta.ts`:
  - `verifyMetaSignature(rawBody, header, appSecret)` — HMAC-SHA256 hex, comparación en tiempo
    constante (`timingSafeEqual`).
  - `parseLeadgenWebhook(body)` — zod sobre `{ object: "page", entry: [{ id, changes: [{ field:
    "leadgen", value: { leadgen_id, page_id, form_id, ad_id?, adgroup_id?, created_time } }] }] }`
    → lista de notificaciones; ignora otros `field`.
  - `fetchMetaLead(deps, leadgenId, pageToken)` — `GET https://graph.facebook.com/<versión>/<id>?fields=id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,platform,is_organic`
    con `fetch` inyectado; error de red o 4xx → `Result` de error con el código de Graph.
  - `toExternalLead(metaLead, mapping)` — `field_data[]` (`name`, `values[]`) a campos: `full_name`,
    `first_name` + `last_name`, `email`, `phone_number`, `company_name`, `job_title`; el resto a
    `rawAnswers`; `platform` `ig` → `instagram`, cualquier otro → `facebook`; `field_mapping` del
    `ad_form` tiene prioridad.
- `packages/core/src/capture/process-inbound.ts`: `processInbound(db, deps, inboundEventId)` —
  carga el evento, despacha por proveedor (Meta en este paso; Google y TikTok en r2-05/06), busca
  el token de la Página en `integration_accounts` (descifrado), llama `ingestExternalLead`, marca
  `procesado` / `error` / `ignorado` (Página sin cuenta conectada).
- Tests: `test/meta.test.ts` con `fetch` falso y fixtures de Facebook e Instagram.

**Done when**
- [ ] WHEN `verifyMetaSignature` receives the HMAC of the exact raw body THE SYSTEM SHALL return true, and SHALL return false for a one-byte change in the body, a wrong secret or a missing header.
- [ ] WHEN `parseLeadgenWebhook` receives a payload with one `leadgen` change and one `feed` change THE SYSTEM SHALL return exactly the `leadgen` notification.
- [ ] WHEN `processInbound` handles a Meta event whose fetched lead has `platform = "ig"` THE SYSTEM SHALL create a lead with `ad_platform = 'instagram'`, `source = 'meta_lead_ads'` and mark the inbound event `procesado`.
- [ ] WHEN the fetched lead carries an unmapped question THE SYSTEM SHALL store it under `raw_answers` with the question key.
- [ ] WHEN the Graph API answers 400 THE SYSTEM SHALL mark the inbound event `error` with the Graph message and return an error `Result` so Inngest retries.
- [ ] WHEN the Page has no connected `integration_accounts` row THE SYSTEM SHALL mark the event `ignorado` and create no lead.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/meta.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 03: meta-adapter` · `r2-step-03-meta-adapter`

---

#### Step r2-04 — Meta webhook

**Do**
- `apps/crm/src/lib/env.ts`: variables de §3 con defaults locales; `INTEGRATIONS_ENCRYPTION_KEY`,
  `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TIKTOK_WEBHOOK_SECRET` obligatorias en producción.
- `apps/crm/src/app/api/webhooks/meta/route.ts`: `GET` de verificación; `POST` lee el cuerpo
  crudo (`request.text()`), verifica firma, parsea y llama `recordInboundEvent` por notificación.
- `apps/crm/src/lib/inngest.ts`: función `process-inbound` (evento `inbound/received`, 4
  reintentos) con `deps` (fetch, versión de Graph, clave de cifrado).
- `apps/crm/e2e/webhooks-meta.spec.ts`.

**Done when**
- [ ] WHEN `GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=12345` is requested THE SYSTEM SHALL respond 200 with body `12345`, and with a wrong token SHALL respond 403.
- [ ] WHEN a `POST` arrives without `X-Hub-Signature-256` or with a wrong one THE SYSTEM SHALL respond 401 and store no `inbound_events` row.
- [ ] WHEN a correctly signed `leadgen` payload is posted THE SYSTEM SHALL respond 200 with `data.duplicate = false`, and posting it again SHALL respond 200 with `data.duplicate = true`.
- [ ] WHEN `parseEnv` receives `VERCEL_ENV=production` without `META_APP_SECRET` THE SYSTEM SHALL throw an error whose message contains `META_APP_SECRET`.

**Verify**
```bash
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/webhooks-meta.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 04: meta-webhook` · `r2-step-04-meta-webhook`

---

#### Step r2-05 — Google Lead Forms

**Do**
- `packages/core/src/integrations/google-leads.ts`: `parseGoogleLead(body)` (zod; `lead_id`,
  `user_column_data[]` con `column_id` y `string_value`, `form_id`, `campaign_id`, `gcl_id`,
  `is_test`, `lead_submit_time`; ignora campos desconocidos; nunca usa `column_name`);
  `toExternalLead` (`FULL_NAME`, `FIRST_NAME`+`LAST_NAME`, `EMAIL`, `PHONE_NUMBER`,
  `COMPANY_NAME`, `JOB_TITLE`; el resto a `rawAnswers`); `verifyGoogleKey` en tiempo constante.
- `capture/process-inbound.ts`: rama `google_ads`.
- `apps/crm/src/app/api/webhooks/google-leads/[adFormId]/route.ts`: busca el `ad_form`, descifra
  la clave, compara `google_key`, registra el evento.
- Tests: `test/google-leads.test.ts`, `e2e/webhooks-google.spec.ts`.

**Done when**
- [ ] WHEN `parseGoogleLead` receives a body with `FULL_NAME`, `EMAIL`, `PHONE_NUMBER` and an unknown column THE SYSTEM SHALL map the three to lead fields and keep the unknown one under `rawAnswers`.
- [ ] WHEN the webhook receives a body whose `google_key` differs from the form's key THE SYSTEM SHALL respond 401 and store nothing.
- [ ] WHEN the webhook receives a valid body for an unknown `adFormId` THE SYSTEM SHALL respond 404.
- [ ] WHEN a valid lead is posted and `processInbound` runs THE SYSTEM SHALL create a lead with `source = 'google_lead_form'`, `ad_platform = 'google'` and `gclid` set from `gcl_id`.
- [ ] WHEN the body has `is_test = true` THE SYSTEM SHALL store the lead with `is_test = true` and write no `lead/created` outbox row.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/google-leads.test.ts
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/webhooks-google.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 05: google-lead-forms` · `r2-step-05-google-lead-forms`

---

#### Step r2-06 — TikTok Lead Ads

**Do**
- `packages/core/src/integrations/tiktok.ts`: contrato normalizado (zod) `{ lead_id, form_id,
  campaign_id?, ad_id?, adgroup_id?, created_time, is_test?, fields: { name?, email?, phone?,
  company?, job_title?, …otras } }`; `verifyTekinsofSignature(rawBody, header, secret)`;
  `toExternalLead`.
- `capture/process-inbound.ts`: rama `tiktok`.
- `apps/crm/src/app/api/webhooks/tiktok/route.ts`.
- Tests: `test/tiktok.test.ts`, `e2e/webhooks-tiktok.spec.ts`.

**Done when**
- [ ] WHEN a body signed with `TIKTOK_WEBHOOK_SECRET` is posted THE SYSTEM SHALL respond 200, and an unsigned or wrongly signed body SHALL get 401.
- [ ] WHEN `processInbound` handles a TikTok event THE SYSTEM SHALL create a lead with `source = 'tiktok_lead_ads'` and `ad_platform = 'tiktok'`, and unknown `fields` keys SHALL land in `raw_answers`.
- [ ] WHEN the same `lead_id` is posted twice THE SYSTEM SHALL keep one lead.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/tiktok.test.ts
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/webhooks-tiktok.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 06: tiktok-leads` · `r2-step-06-tiktok-leads`

---

#### Step r2-07 — Integrations UI

**Do**
- `packages/core/src/auth/permissions.ts`: `integrations.manage`, `dashboard.marketing`.
- `packages/core/src/integrations/accounts.ts`: `connectMetaPage(db, actor, deps, { pageId,
  displayName, pageToken })` (cifra y guarda; audita `integration.connected`),
  `disconnectAccount`, `listAccounts` (nunca devuelve el token), `createGoogleAdForm(db, actor,
  deps, { name, campaignId })` → devuelve **una sola vez** la URL del webhook y la clave generada,
  `mapAdForm(db, actor, { adFormId, campaignId, fieldMapping })`.
- `apps/crm/src/app/(app)/configuracion/integraciones/page.tsx` + `actions.ts`: estado por
  proveedor, formulario para conectar la Página de Meta, lista de `ad_forms` con su campaña y
  estado "sin mapear", alta de formulario de Google.
- `apps/crm/e2e/integrations.spec.ts`.

**Done when**
- [ ] WHEN a `gerencia` user connects a Meta Page with a token THE SYSTEM SHALL store `credentials_encrypted` that does not contain the token text, list the account as `conectada` and write an `integration.connected` audit event.
- [ ] WHEN a `marketing` or `ventas` user opens `/configuracion/integraciones` THE SYSTEM SHALL respond 404.
- [ ] WHEN a Google ad form is created THE SYSTEM SHALL show its webhook URL and key once, and reloading the page SHALL not show the key again.
- [ ] WHEN the page is scanned with axe THE SYSTEM SHALL report zero violations.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/permissions.test.ts
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/integrations.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 07: integrations-ui` · `r2-step-07-integrations-ui`

---

#### Step r2-08 — Meta backfill and token health

**Do**
- `packages/core/src/capture/backfill.ts`: `metaLeadsBackfill(db, deps, now)` — por cada `ad_form`
  activo de Meta, `GET /<form_id>/leads?filtering=[time_created > now-2h]` y `ingestExternalLead`
  (idempotente); un 190/401 de Graph marca la cuenta `expirada` y avisa a Gerencia por correo una
  sola vez; `purgeInboundEvents(db, now)` borra `inbound_events` de más de 90 días.
- `apps/crm/src/lib/inngest.ts`: crons `meta-leads-backfill` (`0 * * * *`) e `inbound-purge`
  (`30 8 * * *`).
- `packages/core/test/backfill.test.ts`.

**Done when**
- [ ] WHEN the backfill finds a lead that the webhook already delivered THE SYSTEM SHALL create no second lead.
- [ ] WHEN the backfill finds a lead the webhook missed THE SYSTEM SHALL create it with `source = 'meta_lead_ads'`.
- [ ] WHEN Graph answers with an expired-token error THE SYSTEM SHALL set the account `status = 'expirada'` and send one mail to every active `gerencia` user, and a second run SHALL send none.
- [ ] WHEN `purgeInboundEvents` runs THE SYSTEM SHALL delete events older than 90 days and keep newer ones.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/backfill.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 08: meta-backfill` · `r2-step-08-meta-backfill`

---

#### Step r2-09 — Landing tracking

**Do**
- `apps/web/src/lib/attribution.ts` (nuevo, extraído de `LeadForm.tsx`, que hoy pasa de 300
  líneas): captura y persistencia en `sessionStorage` de UTM, `gclid`, `fbclid` y `ttclid`.
- `apps/web/src/components/LeadForm.tsx`: usa `attribution.ts`; envía `ttclid`; tras un 201 dispara
  los eventos de conversión **solo con consentimiento** (`tk_consent === "granted"`):
  `gtag('event','generate_lead')`, `fbq('track','Lead')`, `ttq.track('SubmitForm')`, cada uno solo
  si su script existe.
- `apps/web/src/layouts/Base.astro`: píxel de TikTok con `PUBLIC_TIKTOK_PIXEL_ID`, cargado como los
  demás píxeles: solo tras el consentimiento.
- `packages/core/src/leads/leads.ts`: `ttclid` en `publicLeadInput` (el archivo no supera 300 líneas).
- `packages/core/test/leads.test.ts`: caso con `ttclid`.

**Done when**
- [ ] WHEN a public lead is created with `ttclid` THE SYSTEM SHALL store it in `leads.ttclid`.
- [ ] WHEN the site is built with `PUBLIC_TIKTOK_PIXEL_ID=TESTPIXEL` THE SYSTEM SHALL emit `TESTPIXEL` in `dist/index.html` only inside the consent-gated loader.
- [ ] WHEN `apps/web/src/components/LeadForm.tsx` is measured THE SYSTEM SHALL count at most 300 lines.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/leads.test.ts
PUBLIC_TIKTOK_PIXEL_ID=TESTPIXEL pnpm --filter @tekinsof/web build
grep -q "TESTPIXEL" apps/web/dist/index.html
test "$(wc -l < apps/web/src/components/LeadForm.tsx)" -le 300
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 09: landing-tracking` · `r2-step-09-landing-tracking`

---

#### Step r2-10 — Campaign spend

**Do**
- `packages/core/src/marketing/spend.ts`: `recordManualSpend(db, actor, { campaignId, date,
  spendCents, currency })` (upsert por día con `provider = manual`, audita `spend.recorded`);
  `syncMetaSpend(db, deps, date)` — insights por campaña (`/act_<id>/insights?level=campaign&fields=campaign_id,spend,impressions,clicks&time_range=…`)
  unidos por `campaigns.external_refs.meta`; montos a céntimos con aritmética entera de strings
  (nunca `parseFloat`).
- `apps/crm/src/lib/inngest.ts`: cron `spend-sync` (`0 11 * * *`, 06:00 Lima) para el día anterior.
- Formulario de gasto manual en `apps/crm/src/app/(app)/campanas/[id]/gasto/page.tsx` + `actions.ts`.
- `packages/core/test/spend.test.ts`.

**Done when**
- [ ] WHEN Meta reports `spend = "123.45"` for a mapped campaign THE SYSTEM SHALL store `spend_cents = 12345` for that date, and a second sync of the same day SHALL update the row instead of adding one.
- [ ] WHEN a `ventas` user calls `recordManualSpend` THE SYSTEM SHALL return `FORBIDDEN`.
- [ ] WHEN a negative amount is recorded THE SYSTEM SHALL return `VALIDATION_ERROR`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/spend.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 10: campaign-spend` · `r2-step-10-campaign-spend`

---

#### Step r2-11 — Dashboard core

**Do**
- `packages/core/src/marketing/dashboard.ts`: `getMarketingDashboard(db, actor, { from, to,
  campaignId?, source? })` (exige `dashboard.marketing`; excluye `is_test` y borrados) →
  `{ totals, bySource, byCampaign, byDay, funnel }`:
  - `byCampaign`: leads, gasto (PEN; USD al `exchange_rate_default`), CPL en céntimos enteros
    (`null` sin leads), oportunidades, ganadas, monto ganado;
  - `funnel`: lead → contactado (`first_contacted_at`) → calificado → oportunidad → propuesta
    (cotización enviada) → ganada, con conversión entre etapas;
  - `medianFirstContactHours` en horas laborables (`business-hours.ts`).
- `packages/core/test/dashboard.test.ts`.

**Done when**
- [ ] WHEN a campaign has 4 leads and 10000 céntimos of spend in range THE SYSTEM SHALL report `cplCents = 2500` for it.
- [ ] WHEN a test lead (`is_test = true`) exists in range THE SYSTEM SHALL not count it anywhere.
- [ ] WHEN the funnel has 10 leads, 6 contacted and 3 with an opportunity THE SYSTEM SHALL report those counts at the corresponding stages.
- [ ] WHEN a `ventas` user asks for the dashboard THE SYSTEM SHALL return `FORBIDDEN`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/dashboard.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 11: dashboard-core` · `r2-step-11-dashboard-core`

---

#### Step r2-12 — Dashboard UI

**Do**
- `apps/crm/src/app/(app)/marketing/page.tsx`: filtros en la URL (rango, campaña, fuente),
  tarjetas de totales, tabla por campaña (montos `tabular-nums`, `formatAmount`), barras por
  fuente y embudo en SVG accesible (con tabla equivalente), estados vacío y de error.
- Navegación: enlace "Marketing" visible solo con `dashboard.marketing`.
- `apps/crm/e2e/marketing.spec.ts`.

**Done when**
- [ ] WHEN a `marketing` user opens `/marketing` THE SYSTEM SHALL show the headings "Leads por fuente", "Rendimiento por campaña" and "Embudo comercial".
- [ ] WHEN a `ventas` user opens `/marketing` THE SYSTEM SHALL respond 404 and the navigation SHALL not show "Marketing".
- [ ] WHEN the range has no leads THE SYSTEM SHALL show the empty state text "Sin leads en este rango".
- [ ] WHEN the page is scanned with axe THE SYSTEM SHALL report zero violations.

**Verify**
```bash
pnpm --filter @tekinsof/crm build
pnpm --filter @tekinsof/crm test:e2e e2e/marketing.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint** `r2 step 12: dashboard-ui` · `r2-step-12-dashboard-ui`

---

## 5. Lanzamiento de la fase (fuera de los pasos)

1. CRM de R1 en producción (`crm.tekinsof.com`) — prerrequisito de todo lo anterior.
2. Meta: app en developers.facebook.com, verificación del negocio, revisión de `leads_retrieval`,
   `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `ads_read`; webhook
   `https://crm.tekinsof.com/api/webhooks/meta` suscrito a `leadgen`; token de System User
   conectado en `/configuracion/integraciones`.
3. Google: por cada formulario, crear el `ad_form` en el CRM y pegar URL + clave en Google Ads;
   enviar un lead de prueba (`is_test`).
4. TikTok: conector (LeadsBridge/Zapier) configurado contra `/api/webhooks/tiktok` con la firma.
5. Variables de producción de §3 en Vercel (proyecto del CRM).
6. Política de privacidad del sitio: mencionar formularios de Meta, TikTok y Google como canales
   de captación.
