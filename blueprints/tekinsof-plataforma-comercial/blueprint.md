# Plataforma Comercial Tekinsof — Release 1 — Blueprint

> Generado por The Architect el 2026-10-27
> Forma: internal-tool (primaria, el CRM) + marketing-site (secundaria, el sitio) · `knowledge/shapes/internal-tool.md` · `knowledge/shapes/marketing-site.md`
> Runtime track: TypeScript / Node · `knowledge/runtime-tracks/ts-node.md`
> Modo de emisión: bundle (18 pasos)
> Versión del blueprint: 1
> Versiones verificadas: 2026-10-27 — ver §11 para la procedencia de cada paquete

**Cómo leer este documento.** El §9 es la orden de construcción. Todo lo anterior es contexto y
contrato. En modo bundle, cada paso del §9 es también una tarea en `tasks.json` y un bloque en
`epics/`. El constructor trabaja desde `tasks.json` + `epics/` y consulta este archivo solo cuando
un epic lo indica.

**Release 1 y Release 2.** La plataforma completa que se diseñó con el cliente no cabe en un solo
build de 18 pasos de una sesión cada uno. Este blueprint construye la **Release 1: la máquina de
captación y conversión** (prioridades 1–8 del cliente + landings). La **Release 2** (dashboard
gerencial, ventas/pagos/cuentas por cobrar, blog y casos de éxito) recibe su propio blueprint
cuando §20.1 de este quede en verde — ver §1 Non-Goals y §20.4. El modelo de datos de este
documento ya deja los puntos de anclaje para la Release 2.

---

## 1. Project Overview & Non-Goals

### Vision

Tekinsof Consulting (Lima, Perú) vende servicios de tecnología (desarrollo de software, integración
ERP/CRM, Power BI, Microsoft 365, Big Data, infraestructura, ciberseguridad) y de marketing digital
(branding, SEO, publicidad en Google/Meta/LinkedIn/TikTok, automatización comercial, WhatsApp
Business, IA aplicada). Hoy su proceso comercial vive en Excel, correos, documentos de cotización y
el WhatsApp del celular: no hay una base centralizada de prospectos, nadie sabe cuánto tarda un lead
en ser atendido y cada cotización se arma a mano. Su sitio actual es una sola página en GoDaddy
Website Builder con el certificado TLS vencido.

Esta release construye dos superficies sobre **una sola base de datos**: un sitio público estático
(`tekinsof.com`) cuyo único trabajo es convertir visitas en leads con origen y campaña trazables, y
un CRM interno (`crm.tekinsof.com`) donde 3–10 personas de Tekinsof (Gerencia, Ventas, Marketing,
Administración) entran con su cuenta Microsoft 365, reciben cada lead asignado automáticamente,
son alertados si un lead pasa 4 horas laborables sin atención, mueven oportunidades por un
pipeline, emiten cotizaciones en PEN o USD con IGV 18% desglosado y aprobación de Gerencia para
descuentos mayores al 10%, y publican landings de campaña sin depender de un desarrollador.

### Users

| Persona | Qué viene a hacer | Frecuencia |
|---|---|---|
| Ventas (vendedor) | Atender sus leads asignados, registrar leads de WhatsApp, mover oportunidades, cotizar | Diaria, todo el día |
| Gerencia | Recibir alertas de SLA, aprobar descuentos >10%, invitar usuarios, ver el pipeline completo | Diaria |
| Marketing | Crear campañas y landings, revisar origen de leads, administrar el catálogo publicado | Semanal |
| Administración | Consultar cotizaciones aceptadas y su estado (la cobranza llega en Release 2) | Semanal |
| Visitante / prospecto | Entender los servicios, confiar, dejar sus datos o escribir por WhatsApp | Una vez |

### Goals — alcance v1 (Release 1)

1. Todo lead — formulario del sitio, landing de campaña o registro manual desde WhatsApp — queda en
   una sola tabla con su origen, campaña, UTMs y consentimiento de datos personales.
2. Cada lead nuevo se asigna por rotación a un vendedor activo, que recibe un correo al instante; el
   prospecto recibe un acuse desde el buzón Microsoft 365 del vendedor.
3. Gerencia recibe una alerta cuando un lead lleva 4 horas laborables (L–V 09:00–18:00, hora de
   Lima, sin feriados) sin primer contacto.
4. El pipeline de oportunidades (calificación → propuesta → negociación → ganada/perdida) es
   operable con teclado y con arrastre, con actividades y recordatorios.
5. Las cotizaciones se arman desde un catálogo administrable más conceptos libres, en PEN o USD, con
   subtotal, IGV 18% y total; una cotización enviada no se edita, se versiona; los descuentos >10%
   requieren aprobación de Gerencia; se generan en PDF y se envían desde Outlook vía Microsoft Graph;
   se alerta 3 días antes del vencimiento (vigencia 15 días).
6. Marketing crea landings por bloques ligadas a campañas, las previsualiza en el CRM y al
   publicarlas el sitio se regenera solo.
7. El sitio público carga como HTML estático, sirve páginas por servicio desde el catálogo y está
   listo para buscadores y motores de respuesta (sitemap, robots, `llms.txt`, JSON-LD).

### Non-Goals — explícitamente fuera de la v1

| No se construye | Por qué no ahora | Se revisa cuando |
|---|---|---|
| Dashboard gerencial con gráficos (conversión por campaña, pipeline ponderado, ventas consolidadas en PEN) | Necesita datos reales de varias semanas; cabe en la Release 2 con ventas y cobranza | §20.1 en verde + 4 semanas de leads reales |
| Registro de ventas, cronograma de cuotas, pagos y cuentas por cobrar | Prioridad 10 del cliente; depende de cotizaciones aceptadas que esta release ya produce | Inicio de la Release 2 |
| Blog corporativo y casos de éxito administrables | Prioridades 11–12; el sitio v1 vende con servicios, landings y datos de contacto | Inicio de la Release 2 |
| WhatsApp Business Cloud API (leads automáticos, bandeja compartida, plantillas) | El cliente decidió mantener la atención manual en v1; el número actual vive en la app del celular y migrarlo lo desconecta de ella | Tekinsof aprueba migrar un número a la API y verificar el negocio en Meta |
| Facturación electrónica SUNAT | No es obligatoria en v1; el número de factura emitida en SOL se registrará a mano en la Release 2 | Decisión de integrar con un OSE/PSE |
| Campañas masivas de email y secuencias de nurturing | Fuera del alcance acordado; los correos v1 son transaccionales 1:1 | Release 3 de marketing |
| Portal de clientes, firma electrónica, integración con ERP de terceros, IA aplicada a ventas | Fases futuras declaradas por el cliente | Un cliente o un caso de uso concreto lo pide |
| Sitio en inglés | Mercado inicial Perú; la estructura de rutas no lo bloquea | Primera campaña fuera de Perú |
| Importación masiva CSV de empresas y contactos desde Excel | Sin build steps libres en R1; los registros activos son decenas y se cargan a mano desde `/empresas` y `/contactos` | Inicio de la Release 2 |
| Mesa de ayuda, gestión de proyectos, multi-tenant | Excluidos por el cliente desde el inicio | Nunca en esta plataforma sin rediseño |
| Editor visual libre de páginas | Un editor libre rompe el sistema de diseño y la velocidad; v1 usa bloques prediseñados | Marketing demuestra una necesidad que los bloques no cubren |

**El constructor no implementa nada de esta tabla**, aunque parezca una adición pequeña mientras
trabaja en un paso vecino. Si un paso parece requerir un non-goal, es un defecto del blueprint:
detenerse y reportarlo en lugar de ampliar el alcance.

### Success metrics

| Métrica | Meta | Cómo se mide |
|---|---|---|
| Leads con origen trazable | 100% de los leads del sitio con `source` y, si vinieron de campaña, `campaign_id` o `utm_campaign` no nulos, desde el día del lanzamiento | `select count(*) filter (where utm_campaign is null and campaign_id is null and source in ('web_form','landing')) from leads` sobre leads de tráfico pagado |
| Tiempo al primer contacto | Mediana < 4 horas laborables a los 30 días del lanzamiento | `first_contacted_at - created_at` sobre `leads`, excluyendo fines de semana |
| Leads con alerta de SLA | < 10% de los leads del mes a los 60 días | `count(*) filter (where sla_alerted_at is not null) / count(*)` por mes |
| Cotizaciones emitidas desde el CRM | 100% de las cotizaciones del mes a los 30 días (cero cotizaciones en Word) | `select count(*) from quotes where sent_at >= date_trunc('month', now())` contra el registro manual de Administración |
| Rendimiento del sitio | Lighthouse ≥ 95 en Performance y SEO en `/` y una landing | Ejecución de Lighthouse en móvil simulado (lista de lanzamiento, §20.1) |

---

## 2. Tech Stack

**Runtime track: TypeScript / Node.** Esta tabla nombra *elecciones*, no versiones. Toda versión fija
vive en el §11 y en ningún otro lugar de la prosa.

| Capa | Elección | Por qué esta y no otra |
|---|---|---|
| Lenguaje / runtime | TypeScript + Node 24 LTS, monorepo pnpm (`apps/crm`, `apps/web`, `packages/core`) | Un solo lenguaje y **un solo esquema y una sola lógica de negocio** compartidos por el sitio y el CRM. Se rechazó .NET pese a la afinidad con Microsoft porque el equipo no tiene restricción y el ecosistema TS es más rápido para este tipo de producto |
| Framework CRM | Next.js (App Router, server components, server actions) | Tablas, formularios y kanban internos con render en servidor y autorización junto a los datos. Se rechazó un SPA con API aparte: dos superficies que mantener para 10 usuarios |
| Framework sitio | Astro, salida 100% estática, islas React solo donde hay interacción | Cero JS por defecto: velocidad móvil y SEO para el tráfico pagado. Se rechazó servir el sitio desde Next: arrastra hidratación y cómputo a páginas que no lo necesitan |
| Estilos | Tailwind CSS v4 con tokens como variables CSS | Tokens portables (también alimentan el PDF y los correos). Un solo mecanismo de estilos |
| Capa de componentes | HTML nativo (`<dialog>`, `<details>`, `<select>`, `<table>`) + un `ui.tsx` propio + `@dnd-kit` para el kanban | Accesible por defecto sin generar decenas de archivos. Se rechazó shadcn para R1: su CLI genera muchos archivos por componente y rompe el presupuesto de ≤5 archivos por paso |
| Base de datos | Postgres gestionado en **Supabase** (región São Paulo, `sa-east-1`) en producción; **PGlite** embebido para desarrollo local, tests y E2E | Supabase: la región más cercana a Lima, backups y Storage en el mismo servicio. PGlite: Postgres real en proceso, de modo que cada gate corre sin Docker ni red |
| ORM / acceso a datos | Drizzle ORM (dueño único del esquema) + drizzle-kit para generar migraciones | Esquema como código, consultas con forma SQL, runtime liviano, mismo código sobre PGlite y Postgres |
| Auth | Better Auth con proveedor Microsoft Entra ID restringido al tenant de Tekinsof, por invitación | SSO y MFA de M365 sin pagar por usuario. Usuarios y sesiones viven en nuestra base. Se rechazó Clerk (costo por MAU y usuarios fuera de la base) y Supabase Auth (organizaciones y SSO más débiles) |
| Trabajo en segundo plano | Inngest (eventos + cron) servido desde `apps/crm/src/app/api/inngest` | Pasos durables con reintentos sobre funciones serverless. Se rechazó Vercel Cron solo: sin reintentos ni historial |
| Pagos | NOT APPLICABLE — R1 no cobra en línea; las cotizaciones se pagan fuera de la plataforma | — |
| Archivos | Supabase Storage (bucket privado `quotes`); driver `local` en `.data/files` para dev y tests | PDFs de cotización junto a la base, mismo proveedor, mismo backup |
| Correo / notificaciones | Microsoft Graph `sendMail` con permiso de aplicación restringido a un grupo de buzones comerciales; driver `log` en dev y tests | El correo sale del Outlook del vendedor y la respuesta del cliente le llega a él. Sin proveedor de email adicional |
| Antispam | Cloudflare Turnstile en todo formulario público + campo honeypot | Gratuito, sin rompecabezas para el usuario, verificable en servidor |
| PDF | `@react-pdf/renderer` en el servidor | PDF con la marca, generado sin navegador headless |
| Hosting | Vercel: dos proyectos (`tekinsof-crm` → `apps/crm`, `tekinsof-web` → `apps/web`) | Deploy por push, preview por PR, rollback en un clic, TLS automático |
| Gestor de paquetes | pnpm (versión fija en `packageManager`) | Workspaces, node_modules estricto que atrapa dependencias fantasma |

### Compatibility check

Revisado contra `knowledge/stack-compatibility.md`. Ninguna de sus filas de combinaciones problemáticas aplica a este stack:

- **Dos proveedores de identidad:** solo Better Auth es dueño de la sesión. Supabase se usa como Postgres + Storage y **Supabase Auth queda apagado**.
- **Linter que parsea CSS + Tailwind v4:** `biome.json` (emitido en §19.6) activa `css.parser.tailwindDirectives: true` antes del primer `lint`.
- **Conexiones serverless sin pooler:** en producción `DATABASE_URL` apunta al pooler de Supabase (Supavisor, modo transacción, puerto 6543) y el cliente abre con `prepare: false`. `DATABASE_URL_DIRECT` (puerto 5432) se usa solo para migraciones.
- **Procesos de larga vida en un host request-scoped:** no hay workers en memoria; todo trabajo diferido pasa por Inngest.
- **Dos sistemas de migración:** solo drizzle-kit migra. El editor de esquema del dashboard de Supabase es de solo lectura desde el día uno.
- **Driver TCP en runtime edge:** ninguna ruta usa runtime edge. `proxy.ts` corre en Node (default de Next 16).

Gotchas del track que este blueprint arrastra: `proxy.ts` en lugar de `middleware.ts`; Turbopack por defecto; TypeScript 6.0.x fijado y no 7 (Astro); Drizzle 0.x fijado exacto, nunca `^1`; Vercel Cron llama con `GET` (aquí no aplica: el cron es de Inngest); pnpm 12 exige aprobar scripts de build vía `allowBuilds`.

---

## 3. Directory Structure

```
tekinsof-plataforma/                      # raíz del monorepo = raíz del proyecto objetivo
  package.json                            # [workspace] scripts raíz (build/typecheck/test/lint/db:*), packageManager
  pnpm-workspace.yaml                     # [workspace] paquetes + allowBuilds (scripts de build aprobados)
  pnpm-lock.yaml                          # generado por `pnpm install` en §10 — se commitea
  tsconfig.base.json                      # [workspace] opciones TS compartidas (.ts en imports relativos)
  biome.json                              # [workspace] formato + lint; excluye blueprints/, drizzle/, builds
  .nvmrc                                  # [workspace] versión de Node
  .gitignore                              # [workspace] ignora builds, .data/, .env (con excepción .env.example)
  .env.example                            # [workspace] todas las variables, valores locales o vacíos
  CLAUDE.md · AGENTS.md                   # [workspace] instrucciones del agente (§19.1, §19.2)
  .claude/                                # [workspace] settings.json, skills/, rules/ (§19.3–§19.5)
  blueprints/tekinsof-plataforma-comercial/   # este bundle; excluido de todas las herramientas
  .data/                                  # (ignorado) PGlite local: dev/, e2e/ · archivos locales: files/
  apps/
    crm/                                  # Next.js — crm.tekinsof.com
      package.json · next.config.ts · tsconfig.json · postcss.config.mjs · playwright.config.ts   # [workspace]
      e2e/
        helpers/login.ts                  # [workspace] inicia sesión por rol en AUTH_TEST_MODE
        health.spec.ts                    # paso 1
        auth.spec.ts                      # paso 4
        shell.spec.ts                     # paso 5
        users.spec.ts                     # paso 6
        public-leads.spec.ts              # paso 8
        leads.spec.ts                     # paso 9
        quotes.spec.ts                    # paso 15
      src/
        proxy.ts                          # paso 5 — redirección optimista sin cookie de sesión
        lib/
          env.ts                          # paso 4 — variables validadas del CRM (zod)
          auth.ts                         # paso 4 — Better Auth (Entra + modo test)
          actor.ts                        # paso 5 — getActor()/requirePermission(): sesión + usuario activo
          inngest.ts                      # paso 11, editado en 12 — cliente Inngest y registro de funciones
        components/
          ui.tsx                          # paso 6 — Button, Field, Input, Select, Badge, Card, Table, EmptyState
          pipeline-board.tsx              # paso 13 — kanban cliente (@dnd-kit + botones de teclado)
        app/
          layout.tsx · globals.css        # paso 1 — raíz HTML, tokens de diseño, tema por cookie
          login/page.tsx                  # paso 4 — botón Microsoft (+ formulario en modo test)
          (app)/
            layout.tsx                    # paso 5 — exige actor activo; barra lateral, cabecera, tema
            error.tsx                     # paso 6 — límite de error del segmento
            leads/page.tsx                # paso 5 (provisional) → paso 9
            configuracion/usuarios/page.tsx · actions.ts      # paso 6 — invitar, rol, desactivar
            empresas/page.tsx · empresas/[id]/page.tsx        # paso 7
            contactos/page.tsx                                # paso 7
            leads/[id]/page.tsx · leads/nuevo/page.tsx                    # paso 9
            oportunidades/page.tsx · oportunidades/[id]/page.tsx          # paso 13
            cotizaciones/page.tsx · cotizaciones/[id]/page.tsx            # paso 15 (el editor se amplía en el 16)
            catalogo/page.tsx                                             # paso 15
            landings/page.tsx · landings/[id]/page.tsx                    # paso 17
          api/
            health/route.ts               # paso 1 — liveness
            auth/[...all]/route.ts        # paso 4 — handler de Better Auth
            public/leads/route.ts         # paso 8 — POST público del sitio (CORS + Turnstile)
            inngest/route.ts              # paso 11 — endpoint firmado de Inngest
            cotizaciones/[id]/pdf/route.ts  # paso 16 — descarga del PDF
    web/                                  # Astro — tekinsof.com (estático)
      package.json · astro.config.mjs · tsconfig.json · vercel.json   # [workspace]
      public/robots.txt · public/llms.txt                              # [workspace]
      src/
        pages/index.astro                 # paso 1 (placeholder) → paso 10 (portada) → paso 18 (destacados del catálogo)
        pages/servicios/[slug].astro      # paso 18 — una página por servicio publicado
        pages/lp/[slug].astro             # paso 18 — landings publicadas (noindex)
        layouts/Base.astro                # paso 10 — head/SEO/JSON-LD, cabecera, pie, WhatsApp, consentimiento
        components/LeadForm.tsx           # paso 10 — isla: formulario + Turnstile + UTM
        pages/privacidad.astro            # paso 10 — política de privacidad (Ley 29733)
        styles/global.css                 # paso 10 — los mismos tokens del CRM
        lib/content.ts                    # paso 18 — lee catálogo y landings publicadas en build
  packages/
    core/                                 # dominio: esquema, servicios, reglas puras; sin React salvo cms/blocks.tsx y el PDF
      package.json · tsconfig.json · vitest.config.ts · drizzle.config.ts   # [workspace]
      scripts/migrate.ts                  # [workspace] aplica migraciones (PGlite o Postgres)
      scripts/seed.ts                     # paso 18 — catálogo, feriados, landing demo opcional
      drizzle/                            # generado por `pnpm db:generate` — se commitea, nunca se edita a mano
      src/
        db/schema.ts                      # paso 2 — TODAS las tablas de la Release 1 (§4)
        db/client.ts                      # paso 2 — createDb/getDb/createTestDb
        result.ts                         # paso 2 — envoltorio Result y códigos de error (§5)
        auth/permissions.ts               # paso 3 — roles → permisos, can()
        audit/audit.ts                    # paso 3 — writeAudit(tx, …) en la misma transacción
        users/users.ts                    # paso 3 — invitaciones, cambio de rol, desactivación
        crm/accounts.ts                   # paso 7 — empresas y contactos
        leads/leads.ts                    # paso 8 — createPublicLead/createManualLead, dedupe, estados, outbox
        leads/activities.ts               # paso 8 — actividades de leads y oportunidades
        integrations/graph.ts             # paso 11 — token client-credentials, sendMail, estado de cuenta
        automation/lead-created.ts        # paso 11 — asignación por rotación + avisos
        time/business-hours.ts            # paso 12 — horas laborables L–V 09–18 Lima
        automation/sweeps.ts              # paso 12 — SLA, recordatorios, vencimientos, outbox, sync Entra, deploy del sitio
        sales/opportunities.ts            # paso 13 — oportunidades y actividades
        sales/quote-math.ts               # paso 14 — cálculo puro (céntimos, IGV, descuento)
        sales/quotes.ts                   # paso 14 — numeración, estados, versiones, aprobación
        catalog/services.ts               # paso 15 — catálogo administrable
        storage/files.ts                  # paso 16 — Supabase Storage o disco local
        sales/quote-delivery.ts           # paso 16 — PDF (createElement, sin JSX) y envío por Graph
        cms/landings.ts                   # paso 17 — bloques validados, publicar → site_publishes + outbox
        cms/blocks.tsx                    # paso 17 — renderizadores de bloques (CRM preview y sitio)
      test/
        schema.test.ts                    # paso 2
        users.test.ts · permissions.test.ts   # paso 3
        accounts.test.ts                  # paso 7
        leads.test.ts                     # paso 8
        lead-created.test.ts              # paso 11
        business-hours.test.ts · sweeps.test.ts   # paso 12
        opportunities.test.ts             # paso 13
        quote-math.test.ts · quotes.test.ts       # paso 14
        quote-delivery.test.ts            # paso 16
        landings.test.ts                  # paso 17
```

`[workspace]` = archivo emitido en `workspace/` del bundle (§19.6) y copiado antes del paso 1. Todo
otro archivo lo crea exactamente un paso del §9, que lo nombra en su lista **Do** y en el `files`
de su tarea.

**Reglas de frontera**
- `apps/*` importan de `@tekinsof/core/<ruta>` (el `exports` de `packages/core/package.json` mapea
  `./*` → `./src/*.ts`). `packages/core` nunca importa de `apps/*`.
- `packages/core/src/db/client.ts` es el único módulo que abre una conexión. Todo servicio recibe un
  `Db` (o un `Tx`) como primer argumento; nada lee `DATABASE_URL` salvo `getDb()` y `scripts/migrate.ts`.
- Los servicios de `packages/core` no conocen HTTP ni React (excepciones nombradas:
  `cms/blocks.tsx` y `sales/quote-pdf.ts`). Validan su entrada con zod y devuelven
  `{ ok: true, data } | { ok: false, error }`.
- En `apps/crm`, las rutas (`app/**`) llaman a servicios de core a través de server actions o
  route handlers que primero ejecutan `requirePermission()` de `src/lib/actor.ts`. Ningún
  componente cliente (`"use client"`) importa `@tekinsof/core/db/*`.
- `apps/web` lee la base **solo en build** (`src/lib/content.ts`) y nunca escribe en ella. El único
  camino de escritura del sitio es `POST https://crm.tekinsof.com/api/public/leads`.
- Convención de imports: ver la matriz del §19.6 (*Resolution convention matrix*); no se repite aquí.

---

## 4. Data Model

Una sola base Postgres para las dos superficies. **Todo el esquema de la Release 1 se crea en el
paso 2** (una migración inicial generada), así los pasos siguientes solo agregan servicios e
interfaz y nunca compiten por el archivo de esquema. Convenciones: tablas en plural y snake_case;
claves primarias `uuid` con `gen_random_uuid()` salvo las tablas de Better Auth (`text`, id generado
por Better Auth); `created_at`/`updated_at` `timestamptz`; dinero en **céntimos enteros** (`bigint`)
más una columna `currency` (`PEN`|`USD`); enums como `text` con `check`; borrado lógico con
`deleted_at` en entidades comerciales.

### Entities

**users** — personal de Tekinsof (tabla de Better Auth extendida). Se crea en el primer login con
Microsoft, solo si existe una invitación vigente o es el administrador inicial.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK | generado por Better Auth |
| name, email | text | not null; email unique | email = UPN de Microsoft 365 |
| email_verified | boolean | not null default false | campo de Better Auth |
| image | text | null | |
| role | text | not null default `ventas` | `gerencia` · `ventas` · `marketing` · `administracion` (validado en `auth/permissions.ts`) |
| is_active | boolean | not null default true | false = desactivado; toda petición posterior responde 401/redirige |
| receives_leads | boolean | not null default true | participa en la rotación de leads (solo si `role='ventas'`) |
| last_assigned_at | timestamptz | null | rotación: se asigna al vendedor con el valor más antiguo (null primero) |

**sessions / accounts / verifications** — tablas de Better Auth tal cual las define Better Auth 1.7
(ver el bloque de esquema); `sessions.user_id` y `accounts.user_id` en cascada al borrar el usuario.

**invitations** — quién puede entrar. `email` unique, `role` not null, `invited_by` → users,
`accepted_at` (se marca en el primer login), `revoked_at`.

**app_settings** — clave/valor `jsonb` (p. ej. `exchange_rate_default` = `{"usdToPen":"3.7500"}`).

**holidays** — `date` unique (`YYYY-MM-DD`), `name`. Excluidos del cálculo de horas laborables.

**audit_events** — append-only. `actor_id` → users (set null), `action` (`objeto.verbo`, contrato
estable: nunca se renombra), `target_type`, `target_id`, `metadata jsonb` (antes/después),
`request_id`, `occurred_at`. Se escribe en la misma transacción que el cambio que describe.

**outbox** — eventos de dominio pendientes de enviar a Inngest. `event_name`, `payload jsonb`,
`attempts`, `last_error`, `sent_at` (null = pendiente). Se escribe en la misma transacción que la
fila que lo origina; un barrido por cron reintenta los pendientes.

**companies** — `name` not null, `ruc` (11 dígitos, único entre no borradas), `industry`,
`website`, `phone`, `address`, `owner_id`, `created_by`, `deleted_at`.

**contacts** — `company_id` → companies (set null), `full_name` not null, `email` (único sin
mayúsculas entre no borrados), `phone` (E.164, p. ej. `+51981053022`), `job_title`, `owner_id`,
`marketing_consent_at`, `deleted_at`.

**campaigns** — `name`, `slug` unique, `channel` ∈ `google_ads, meta_ads, linkedin_ads,
tiktok_ads, seo, email, whatsapp, referral, event, other`, `starts_on`, `ends_on`, `budget_cents`,
`currency`, `is_active`.

**leads** — el corazón de la release.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| status | text | default `nuevo`; check ∈ nuevo, contactado, calificado, descartado, convertido | transiciones en `leads/leads.ts` (§5) |
| source | text | check ∈ web_form, landing, whatsapp, referral, manual, event, other | |
| campaign_id | uuid | FK campaigns, set null | resuelto desde `campaignSlug` o `utm_campaign` = `campaigns.slug` |
| landing_slug | text | null | landing de origen |
| full_name | text | not null | |
| email, phone | text | check: al menos uno no nulo | email en minúsculas; teléfono E.164 |
| company_name, service_interest, message | text | null | `service_interest` = `services.slug` |
| utm_source…utm_content, gclid, fbclid, referrer | text | null | atribución de campañas |
| consent_at, consent_version | timestamptz, text | check: obligatorio si source ∈ web_form, landing | Ley 29733 |
| owner_id, assigned_at | text, timestamptz | FK users | asignado por rotación (paso 11) |
| first_contacted_at | timestamptz | null | se fija al pasar a `contactado` o al registrar la primera actividad |
| sla_due_at | timestamptz | null | `created_at` + 4 horas laborables (paso 12) |
| sla_alerted_at | timestamptz | null | evita alertas duplicadas |
| discard_reason | text | obligatorio para pasar a `descartado` (regla del servicio) | |
| contact_id, company_id | uuid | FK, set null | se completan al convertir |
| created_by, deleted_at | | | `created_by` null = vino del sitio |

**opportunities** — `title`, `stage` ∈ calificacion, propuesta, negociacion, ganada, perdida;
`position` (orden en la columna del kanban); `amount_cents` + `currency`; `expected_close_on`;
`company_id`, `contact_id`, `lead_id` (único: un lead genera como máximo una oportunidad);
`owner_id` not null; `lost_reason` (check: obligatorio si `perdida`); `won_at`, `lost_at`.

**activities** — `type` ∈ llamada, reunion, correo, whatsapp, tarea, nota; `subject`, `notes`,
`due_at`, `done_at`, `reminded_at`, `owner_id`; padre: `lead_id` | `opportunity_id` | `contact_id`
(check: al menos uno).

**services** — catálogo administrable: `code` unique (`SW-DEV`), `name`, `slug` unique,
`category` ∈ tecnologia, marketing; `summary`, `body` (texto con párrafos para la página del
servicio), `unit` ∈ servicio, hora, mes, licencia, proyecto; `base_price_cents` + `currency`;
`is_active` (cotizable), `is_published` (visible en el sitio), `is_featured` (portada),
`sort_order`, `seo_title`, `seo_description`.

**quote_sequences** — `year` PK, `last_number`. Numeración `COT-<año>-<4 dígitos>` sin huecos,
incrementada con `update … returning` dentro de la transacción.

**quotes** — `number` + `version` (único juntos), `status` ∈ borrador, pendiente_aprobacion,
aprobada, enviada, aceptada, rechazada, vencida, reemplazada; `opportunity_id` not null;
`company_id`, `contact_id`, `owner_id`; `currency`; `exchange_rate` numeric(10,4) PEN por USD
guardado en cada documento; `discount_pct` numeric(5,2) 0–100; `subtotal_cents`,
`discount_cents`, `igv_cents`, `total_cents` (calculados por `quote-math.ts`, nunca por la UI);
`issued_on`, `valid_until` (= emisión + 15 días); `notes`, `terms`; `approved_by`, `approved_at`;
`sent_at`; `expiry_alerted_at`; `pdf_path`.

**quote_items** — `quote_id` (cascade), `service_id` (null = concepto libre), `description`,
`quantity` numeric(10,2) > 0, `unit_price_cents` ≥ 0, `line_total_cents`, `sort_order`.

**landing_pages** — `slug` (kebab-case, unique), `title`, `status` ∈ borrador, publicada,
archivada; `campaign_id`; `seo_title`, `seo_description`; `blocks jsonb` (lista validada por el
esquema zod de `cms/landings.ts`, §5); `whatsapp_message`; `published_at`, `updated_by`.

**site_publishes** — solicitudes de regeneración del sitio: `requested_by`, `reason`, `status`
∈ pendiente, disparado, error; `triggered_at`, `error`.

**opportunity_services** — tabla puente (PK compuesta) oportunidad ↔ servicio, para el reporte por
línea de servicio de la Release 2.

**conversations / messages** — anclas para la integración con WhatsApp Business Cloud API (ningún
código de R1 las escribe). `conversations`: `channel` ∈ whatsapp, email, web; `external_id` (id del
hilo en el canal, único por canal); `contact_phone`; `lead_id`, `contact_id`; `last_message_at`.
`messages`: `conversation_id` (cascade), `direction` ∈ in, out; `external_id` único (id del mensaje
en Meta, para idempotencia de webhooks); `body`, `payload jsonb`, `status`, `sent_by`, `occurred_at`.

### Relationships

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

### Indexes

| Table | Index | Why |
|---|---|---|
| leads | (status, created_at) | bandeja de leads filtrada por estado, ordenada por fecha |
| leads | (owner_id, status) | "mis leads" del vendedor |
| leads | lower(email) | deduplicación de envíos repetidos en 24 h |
| leads | parcial (sla_due_at) where sin contacto y sin alerta | barrido de SLA cada 15 minutos |
| contacts | único parcial lower(email) | no duplicar contactos |
| companies | único parcial ruc | no duplicar empresas por RUC |
| opportunities | (stage, position) · (owner_id, stage) | columnas del kanban |
| activities | parcial (due_at) where pendiente y sin recordatorio | barrido de recordatorios |
| quotes | único (number, version) · (status, valid_until) | versionado · barrido de vencimientos |
| audit_events | (target_type, target_id) · (actor_id, occurred_at) | historial de un registro · actividad de un usuario |
| outbox | (sent_at, created_at) | barrido de pendientes |

### Schema

`packages/core/src/db/schema.ts` — completo. El paso 2 lo escribe **exactamente así**.

```ts
// The single source of truth for every table in Release 1. Column names are snake_case in SQL and
// camelCase in TypeScript via `casing: "snake_case"` (drizzle.config.ts and src/db/client.ts).
// Money is integer céntimos (bigint, mode number) + a currency column. Timestamps are timestamptz.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const deletedAt = () => timestamp({ withTimezone: true });

// ─── Identity (Better Auth tables; property names are Better Auth's field names) ──────────────
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text().notNull().default("ventas"),
  isActive: boolean().notNull().default(true),
  receivesLeads: boolean().notNull().default(true),
  lastAssignedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_sessions_user_id").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_accounts_user_id").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_verifications_identifier").on(t.identifier)],
);

export const invitations = pgTable("invitations", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  role: text().notNull(),
  invitedBy: text().references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── System ──────────────────────────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

export const holidays = pgTable("holidays", {
  id: uuid().primaryKey().defaultRandom(),
  date: date({ mode: "string" }).notNull().unique(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    metadata: jsonb().notNull().default({}),
    requestId: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_events_target").on(t.targetType, t.targetId),
    index("idx_audit_events_actor").on(t.actorId, t.occurredAt),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventName: text().notNull(),
    payload: jsonb().notNull(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_outbox_pending").on(t.sentAt, t.createdAt)],
);

// ─── Accounts: companies and contacts ────────────────────────────────────────────────────────
export const companies = pgTable(
  "companies",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    ruc: text(),
    industry: text(),
    website: text(),
    phone: text(),
    address: text(),
    ownerId: text().references(() => users.id, { onDelete: "set null" }),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("uq_companies_ruc")
      .on(t.ruc)
      .where(sql`${t.ruc} is not null and ${t.deletedAt} is null`),
    index("idx_companies_owner").on(t.ownerId),
    check("ck_companies_ruc", sql`${t.ruc} is null or ${t.ruc} ~ '^[0-9]{11}$'`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    fullName: text().notNull(),
    email: text(),
    phone: text(),
    jobTitle: text(),
    ownerId: text().references(() => users.id, { onDelete: "set null" }),
    marketingConsentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("uq_contacts_email")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null and ${t.deletedAt} is null`),
    index("idx_contacts_company").on(t.companyId),
  ],
);

// ─── Marketing: campaigns and leads ──────────────────────────────────────────────────────────
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    channel: text().notNull(),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    budgetCents: bigint({ mode: "number" }),
    currency: text().notNull().default("PEN"),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "ck_campaigns_channel",
      sql`${t.channel} in ('google_ads','meta_ads','linkedin_ads','tiktok_ads','seo','email','whatsapp','referral','event','other')`,
    ),
    check("ck_campaigns_currency", sql`${t.currency} in ('PEN','USD')`),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid().primaryKey().defaultRandom(),
    status: text().notNull().default("nuevo"),
    source: text().notNull(),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    landingSlug: text(),
    fullName: text().notNull(),
    email: text(),
    phone: text(),
    companyName: text(),
    serviceInterest: text(),
    message: text(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    utmTerm: text(),
    utmContent: text(),
    gclid: text(),
    fbclid: text(),
    referrer: text(),
    consentAt: timestamp({ withTimezone: true }),
    consentVersion: text(),
    ownerId: text().references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp({ withTimezone: true }),
    firstContactedAt: timestamp({ withTimezone: true }),
    slaDueAt: timestamp({ withTimezone: true }),
    slaAlertedAt: timestamp({ withTimezone: true }),
    discardReason: text(),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("idx_leads_status_created").on(t.status, t.createdAt),
    index("idx_leads_owner").on(t.ownerId, t.status),
    index("idx_leads_email").on(sql`lower(${t.email})`),
    index("idx_leads_sla")
      .on(t.slaDueAt)
      .where(sql`${t.firstContactedAt} is null and ${t.slaAlertedAt} is null`),
    check(
      "ck_leads_status",
      sql`${t.status} in ('nuevo','contactado','calificado','descartado','convertido')`,
    ),
    check(
      "ck_leads_source",
      sql`${t.source} in ('web_form','landing','whatsapp','referral','manual','event','other')`,
    ),
    check("ck_leads_reach", sql`${t.email} is not null or ${t.phone} is not null`),
    check(
      "ck_leads_public_consent",
      sql`${t.source} not in ('web_form','landing') or ${t.consentAt} is not null`,
    ),
  ],
);

// ─── Sales: opportunities and activities ─────────────────────────────────────────────────────
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    stage: text().notNull().default("calificacion"),
    position: integer().notNull().default(0),
    amountCents: bigint({ mode: "number" }).notNull().default(0),
    currency: text().notNull().default("PEN"),
    expectedCloseOn: date({ mode: "string" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    leadId: uuid().references(() => leads.id, { onDelete: "set null" }),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lostReason: text(),
    wonAt: timestamp({ withTimezone: true }),
    lostAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("idx_opportunities_stage").on(t.stage, t.position),
    index("idx_opportunities_owner").on(t.ownerId, t.stage),
    uniqueIndex("uq_opportunities_lead")
      .on(t.leadId)
      .where(sql`${t.leadId} is not null and ${t.deletedAt} is null`),
    check(
      "ck_opportunities_stage",
      sql`${t.stage} in ('calificacion','propuesta','negociacion','ganada','perdida')`,
    ),
    check("ck_opportunities_currency", sql`${t.currency} in ('PEN','USD')`),
    check(
      "ck_opportunities_lost_reason",
      sql`${t.stage} <> 'perdida' or ${t.lostReason} is not null`,
    ),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: text().notNull(),
    subject: text().notNull(),
    notes: text(),
    dueAt: timestamp({ withTimezone: true }),
    doneAt: timestamp({ withTimezone: true }),
    remindedAt: timestamp({ withTimezone: true }),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    leadId: uuid().references(() => leads.id, { onDelete: "cascade" }),
    opportunityId: uuid().references(() => opportunities.id, { onDelete: "cascade" }),
    contactId: uuid().references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_activities_due")
      .on(t.dueAt)
      .where(sql`${t.doneAt} is null and ${t.remindedAt} is null`),
    index("idx_activities_opportunity").on(t.opportunityId),
    index("idx_activities_lead").on(t.leadId),
    check(
      "ck_activities_type",
      sql`${t.type} in ('llamada','reunion','correo','whatsapp','tarea','nota')`,
    ),
    check(
      "ck_activities_parent",
      sql`${t.leadId} is not null or ${t.opportunityId} is not null or ${t.contactId} is not null`,
    ),
  ],
);

// ─── Catalog and quotes ──────────────────────────────────────────────────────────────────────
export const services = pgTable(
  "services",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    category: text().notNull(),
    summary: text().notNull().default(""),
    body: text().notNull().default(""),
    unit: text().notNull().default("servicio"),
    basePriceCents: bigint({ mode: "number" }).notNull().default(0),
    currency: text().notNull().default("PEN"),
    isActive: boolean().notNull().default(true),
    isPublished: boolean().notNull().default(false),
    isFeatured: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(100),
    seoTitle: text(),
    seoDescription: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_services_category", sql`${t.category} in ('tecnologia','marketing')`),
    check("ck_services_unit", sql`${t.unit} in ('servicio','hora','mes','licencia','proyecto')`),
    check("ck_services_currency", sql`${t.currency} in ('PEN','USD')`),
  ],
);

export const quoteSequences = pgTable("quote_sequences", {
  year: integer().primaryKey(),
  lastNumber: integer().notNull().default(0),
});

export const quotes = pgTable(
  "quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull(),
    version: integer().notNull().default(1),
    status: text().notNull().default("borrador"),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: text().notNull().default("PEN"),
    exchangeRate: numeric({ precision: 10, scale: 4 }).notNull(),
    discountPct: numeric({ precision: 5, scale: 2 }).notNull().default("0"),
    subtotalCents: bigint({ mode: "number" }).notNull().default(0),
    discountCents: bigint({ mode: "number" }).notNull().default(0),
    igvCents: bigint({ mode: "number" }).notNull().default(0),
    totalCents: bigint({ mode: "number" }).notNull().default(0),
    issuedOn: date({ mode: "string" }),
    validUntil: date({ mode: "string" }),
    notes: text(),
    terms: text(),
    approvedBy: text().references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    expiryAlertedAt: timestamp({ withTimezone: true }),
    pdfPath: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_quotes_number_version").on(t.number, t.version),
    index("idx_quotes_opportunity").on(t.opportunityId),
    index("idx_quotes_status_valid").on(t.status, t.validUntil),
    check(
      "ck_quotes_status",
      sql`${t.status} in ('borrador','pendiente_aprobacion','aprobada','enviada','aceptada','rechazada','vencida','reemplazada')`,
    ),
    check("ck_quotes_currency", sql`${t.currency} in ('PEN','USD')`),
    check("ck_quotes_discount", sql`${t.discountPct} >= 0 and ${t.discountPct} <= 100`),
    check("ck_quotes_exchange_rate", sql`${t.exchangeRate} > 0`),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    quoteId: uuid()
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    serviceId: uuid().references(() => services.id, { onDelete: "set null" }),
    description: text().notNull(),
    quantity: numeric({ precision: 10, scale: 2 }).notNull().default("1"),
    unitPriceCents: bigint({ mode: "number" }).notNull(),
    lineTotalCents: bigint({ mode: "number" }).notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    index("idx_quote_items_quote").on(t.quoteId, t.sortOrder),
    check("ck_quote_items_quantity", sql`${t.quantity} > 0`),
    check("ck_quote_items_price", sql`${t.unitPriceCents} >= 0`),
  ],
);

// ─── CMS: landing pages and site publishing ──────────────────────────────────────────────────
export const landingPages = pgTable(
  "landing_pages",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    status: text().notNull().default("borrador"),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    seoTitle: text(),
    seoDescription: text(),
    blocks: jsonb().notNull().default([]),
    whatsappMessage: text(),
    publishedAt: timestamp({ withTimezone: true }),
    updatedBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_landing_pages_status", sql`${t.status} in ('borrador','publicada','archivada')`),
    check("ck_landing_pages_slug", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const sitePublishes = pgTable("site_publishes", {
  id: uuid().primaryKey().defaultRandom(),
  requestedBy: text().references(() => users.id, { onDelete: "set null" }),
  reason: text().notNull(),
  status: text().notNull().default("pendiente"),
  triggeredAt: timestamp({ withTimezone: true }),
  error: text(),
  createdAt: createdAt(),
});

// Composite-key join kept for R2 reporting: which services an opportunity is about.
export const opportunityServices = pgTable(
  "opportunity_services",
  {
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    serviceId: uuid()
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.serviceId] })],
);

// ─── Messaging (anchors for the WhatsApp Cloud API integration; no R1 code writes these) ─────
export const conversations = pgTable(
  "conversations",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: text().notNull().default("whatsapp"),
    externalId: text().notNull(),
    contactPhone: text(),
    leadId: uuid().references(() => leads.id, { onDelete: "set null" }),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    lastMessageAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_conversations_channel_external").on(t.channel, t.externalId),
    check("ck_conversations_channel", sql`${t.channel} in ('whatsapp','email','web')`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text().notNull(),
    externalId: text().unique(),
    body: text(),
    payload: jsonb().notNull().default({}),
    status: text(),
    sentBy: text().references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_messages_conversation").on(t.conversationId, t.occurredAt),
    check("ck_messages_direction", sql`${t.direction} in ('in','out')`),
  ],
);
```

### Migrations

- Herramienta: drizzle-kit genera SQL a partir de `schema.ts` (`pnpm db:generate`, que no se conecta
  a ninguna base). `packages/core/scripts/migrate.ts` (emitido en §19.6) aplica las migraciones a
  `DATABASE_URL_DIRECT` si existe, si no a `DATABASE_URL`. Acepta `pglite://<dir>` y `postgres://…`.
- Los archivos bajo `packages/core/drizzle/` los nombra drizzle-kit (prefijo numérico + nombre
  aleatorio). Ningún paso escribe ni renombra uno a mano; se commitean tal cual.
- Producción: las migraciones corren como paso explícito del deploy del CRM (`pnpm db:migrate` con
  `DATABASE_URL_DIRECT`), nunca al arrancar la app. Solo hacia adelante; cambios destructivos en
  tres releases: expandir → migrar datos → contraer.
- El editor de tablas de Supabase es de solo lectura para el equipo: un solo sistema de migración.

### Seed data

`packages/core/scripts/seed.ts` (paso 18), comando `pnpm db:seed`, idempotente (`on conflict do
nothing` / `do update` por clave natural):

- **Catálogo** (`services`): la tabla literal del paso 18 (código, nombre, slug, categoría,
  publicado, destacado). Registrados pero **no publicados** (`is_published=false`): Mesa de Ayuda,
  Outsourcing TIC, Equipamiento Tecnológico, Licenciamiento de Software — se publican desde
  `/catalogo` sin desarrollo. Precio base `0` (Gerencia los completa).
- **Feriados** de Perú 2026 y 2027 (tabla del paso 18). Administrables; se verifican contra el
  calendario oficial antes del lanzamiento (§20.1).
- **Ajustes**: `exchange_rate_default` = `{"usdToPen":"3.7500"}`.
- **Landing demo** `demo-desarrollo-software` publicada, **solo si** `SEED_DEMO=1` (se usa en los
  gates del paso 18; nunca en producción).
- **Usuarios**: ninguno. El primer usuario es `CRM_BOOTSTRAP_ADMIN_EMAIL`, que entra con Microsoft y
  recibe `gerencia`; él invita al resto desde `/configuracion/usuarios`.

---

## 5. API Design

### Conventions

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

### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/health` | Liveness: `{ status: "ok", service: "crm", commit }` | público | — |
| GET, POST | `/api/auth/[...all]` | Handler de Better Auth (OAuth Microsoft, sesión, sign-out; email+password solo con `AUTH_TEST_MODE=1`) | público | límites internos de Better Auth |
| OPTIONS, POST | `/api/public/leads` | Lead desde el sitio o una landing | público con CORS a `SITE_ORIGIN` + Turnstile | 20/min/IP (Vercel Firewall) |
| GET, POST, PUT | `/api/inngest` | Endpoint de Inngest (firma verificada por el SDK con `INNGEST_SIGNING_KEY`) | firma Inngest | — |
| GET | `/api/cotizaciones/[id]/pdf` | PDF de la cotización (genera y guarda si falta) | `quotes.read` | — |

### Critical endpoints — full detail

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

## 6. Frontend Architecture

### Routes

**CRM (`apps/crm`)**

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/login` | Entrar con Microsoft (y formulario de prueba solo con `AUTH_TEST_MODE=1`) | — | público |
| `/` | Redirige a `/leads` (en `proxy.ts`) | — | sesión |
| `/leads` | Bandeja: filtros por estado, dueño, origen, campaña; badge de SLA vencido | server query `listLeads` | `leads.read` |
| `/leads/nuevo` | Alta rápida (3 campos visibles + "más datos"), pensada para registrar un WhatsApp desde el celular | server action `createManualLead` | `leads.create` |
| `/leads/[id]` | Detalle, atribución, cambio de estado, actividades (la conversión se hace desde `/oportunidades` eligiendo un lead calificado) | server query | `leads.read` |
| `/empresas`, `/empresas/[id]` | Lista + alta; detalle con contactos y oportunidades | server query | `accounts.read` |
| `/contactos` | Lista + alta | server query | `accounts.read` |
| `/oportunidades` | Kanban por etapa (filtro "mías"/"todas") | server query + isla cliente `pipeline-board.tsx` | `opportunities.read` |
| `/oportunidades/[id]` | Detalle, actividades, cotizaciones de la oportunidad | server query | `opportunities.read` |
| `/cotizaciones`, `/cotizaciones/[id]` | Lista; editor (ítems, moneda, tipo de cambio, descuento), enviar a aprobación, aprobar, PDF, enviar, nueva versión | server query + actions | `quotes.read` |
| `/catalogo` | Catálogo de servicios (precio base, activo, publicado, destacado) | server query + actions | `catalog.read` |
| `/landings`, `/landings/[id]` | Lista; editor de bloques + vista previa + publicar | server query + actions | `landings.write` |
| `/configuracion/usuarios` | Invitar, cambiar rol, desactivar | server query + actions | `users.manage` |

**Sitio (`apps/web`)** — todo estático, generado en build.

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/` | Portada: propuesta de valor, servicios destacados, por qué Tekinsof, contacto con formulario, WhatsApp y Bookings | catálogo publicado (build) | público |
| `/servicios/[slug]` | Una página por servicio publicado, con formulario precargado con `serviceInterest` | `services` publicados (build) | público |
| `/lp/[slug]` | Landing publicada (`noindex`), bloques + formulario ligado a su campaña | `landing_pages` publicadas (build) | público |
| `/sitemap-index.xml`, `/robots.txt`, `/llms.txt` | Superficie SEO / motores de respuesta | build / estático | público |

### Rendering strategy

- **CRM:** todo se renderiza en servidor por petición (el root layout lee la cookie `theme` con
  `cookies()`, lo que vuelve dinámicas todas las rutas — es lo correcto para una herramienta con
  sesión). Sin `"use cache"` ni `cacheComponents` en R1. `"use client"` solo en hojas:
  `pipeline-board.tsx` y `(app)/error.tsx`. El selector de tema es un `<form>` con server action (sin
  JS) y el editor de landings funciona con formularios y botones submit (sin JS de cliente).
- **Sitio:** `output: "static"`; Astro genera HTML en build. Islas: solo `LeadForm.tsx`
  (`client:visible`). El widget de Turnstile y los píxeles de anuncios se cargan desde el cliente
  **después** del consentimiento (los píxeles) o al hacerse visible el formulario (Turnstile).
- **Regeneración del sitio:** publicar una landing o cambiar la publicación de un servicio en el
  CRM → `site_publishes` + outbox → función `site-deploy` → `VERCEL_DEPLOY_HOOK_URL` → nuevo build
  (~2 min). No hay ISR ni servidor en el sitio.

### Component hierarchy

```
CRM /oportunidades
app/layout.tsx (server: <html class=tema>)
└─ app/(app)/layout.tsx (server: requireActor(); barra lateral filtrada por can(); form de tema con server action)
   └─ app/(app)/oportunidades/page.tsx (server: listOpportunitiesByStage)
      └─ components/pipeline-board.tsx ("use client": @dnd-kit; botones ←/→ por tarjeta)
         └─ server action moveOpportunity (revalida /oportunidades)

Sitio /lp/[slug]
layouts/Base.astro (head SEO + JSON-LD Organization, cabecera, pie, banner de consentimiento)
└─ pages/lp/[slug].astro (getStaticPaths ← lib/content.ts)
   ├─ <Block> de @tekinsof/core/cms/blocks (estático, sin JS)
   └─ <LeadForm client:visible> (isla: validación, Turnstile, UTM desde la URL, POST al CRM)
```

### State management

- Estado del servidor: se renderiza en server components; las mutaciones son server actions que
  terminan en `revalidatePath()` de la ruta afectada. Sin caché de cliente (no TanStack Query en R1).
- Filtros, página y orden de las listas viven en la URL (`?estado=nuevo&page=2`).
- Estado local de UI (arrastre del kanban, campos del editor de bloques) en `useState` dentro de la
  hoja cliente. Sin store global.
- El formulario del sitio guarda los UTM de la primera visita en `sessionStorage` (`tk_utm`) para
  enviarlos aunque el visitante navegue antes de convertir.

### Loading, empty, and error states

| Superficie | Cargando | Vacío | Error |
|---|---|---|---|
| Listas del CRM (`leads`, `empresas`, `contactos`, `cotizaciones`, `landings`) | `<Suspense>` en `(app)/layout.tsx` con un esqueleto de tabla de 8 filas (paso 5) | `EmptyState` de `ui.tsx` con la acción primaria ("Registrar lead", "Nueva empresa"…) | `(app)/error.tsx` (paso 6): mensaje + "Reintentar" (`reset()`) |
| Kanban | esqueleto de 5 columnas | columna vacía con "Sin oportunidades" | toast de error y la tarjeta vuelve a su columna si `moveOpportunity` devuelve `ok:false` |
| Formularios (server actions) | botón deshabilitado con `useFormStatus` | — | errores por campo devueltos en `error.fields`, anunciados con `aria-live="polite"` |
| Formulario del sitio | botón "Enviando…" deshabilitado | — | mensaje en texto (no solo color) + enlace a WhatsApp como alternativa |

El esqueleto de carga vive en `(app)/layout.tsx` (paso 5, `<Suspense fallback>`), y el límite de error del
segmento es `(app)/error.tsx` (paso 6). No existe un `loading.tsx` aparte.

---

## 7. Design System

Derivado del logo actual de Tekinsof (colores muestreados del archivo `teklogo` del sitio vigente) y
aprobado por el cliente. `ui-ux-pro-max` no estaba disponible en la sesión de diseño; se usó
`knowledge/capabilities/styling.md` con valores literales. Los tokens se definen **una vez** en
`apps/crm/src/app/globals.css` (paso 1) y se replican idénticos en `apps/web/src/styles/global.css`
(paso 10).

### Colors

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

### Typography

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

### Spacing, radius, elevation

- Espaciado: base 4px — rampa 4, 8, 12, 16, 24, 32, 48, 64, 96 (utilidades por defecto de Tailwind;
  sin valores arbitrarios).
- Radio: `--radius-control` 10px (botones, inputs, chips) · `--radius-card` 14px (tarjetas, diálogos) · avatares `9999px`.
- Sombras: CRM plano con bordes (`1px solid var(--border)`); diálogos `0 10px 30px rgb(18 20 23 / 0.18)`;
  tarjetas del sitio al pasar el mouse `0 6px 20px rgb(18 20 23 / 0.10)`.
- Ancho máximo: sitio 1200px de contenido (texto largo 72ch); CRM fluido con barra lateral de 248px
  (colapsa a cajón bajo 1024px).
- Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 — diseño móvil primero.

### Motion

- Duraciones: 120ms (hover, foco), 180ms (abrir menús, toasts), 240ms (diálogos, cajón móvil).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` de entrada; `cubic-bezier(0.4, 0, 1, 1)` de salida.
- Solo `transform` y `opacity`. Arrastre del kanban: la tarjeta se eleva con sombra de diálogo.
- `prefers-reduced-motion: reduce` anula animaciones y transiciones (regla global en `globals.css`).

### Component style

Corporativo-tecnológico en la línea de Microsoft y WorkOS: mucho aire en el sitio, densidad útil en
el CRM, superficies planas con bordes finos y un solo acento coral por pantalla (el CTA). El motivo
gráfico de la marca son **tres barras inclinadas** (tinta, coral, lila) del logo, usadas como
separador de sección y fondo del hero, nunca como decoración en el CRM. Si un componente nuevo
necesita un color que no está en la tabla, el componente está mal, no la tabla.

---

## 8. Authentication & Authorization

### Provider and rationale

**Better Auth** con el proveedor social `microsoft` configurado con el `tenantId` de Tekinsof
(un solo tenant: cuentas de otros tenants no pueden entrar) y `prompt: "select_account"`. Usuarios y
sesiones viven en nuestra Postgres (sin costo por usuario, con llaves foráneas reales). MFA y
políticas de acceso condicional las aplica Entra ID antes de devolver al CRM.

### Flows

1. **Primer acceso (bootstrap):** la persona con `CRM_BOOTSTRAP_ADMIN_EMAIL` entra con Microsoft →
   Better Auth crea su `users` con `role = gerencia`. Nadie más puede crear cuenta sin invitación.
2. **Invitación:** Gerencia invita un email (debe terminar en `@<ALLOWED_EMAIL_DOMAIN>`) con un rol
   → fila `invitations`. La persona entra con Microsoft → el hook `databaseHooks.user.create.before`
   de Better Auth busca una invitación vigente (no aceptada, no revocada) para ese email: si existe,
   crea el usuario con ese rol y marca `accepted_at`; si no, **rechaza** la creación y el login
   redirige a `/login?error=no_invitation` ("Tu cuenta no tiene acceso al CRM. Pide una invitación a
   Gerencia.").
3. **Login recurrente:** Microsoft → callback `/api/auth/callback/microsoft` → cookie de sesión →
   `/leads`. `requireActor()` en `(app)/layout.tsx` vuelve a leer `users.is_active` en cada petición.
4. **Expiración:** sesiones de 12 horas (`expiresIn`), renovadas como máximo cada hora de uso
   (`updateAge`). Una sesión vencida vuelve a `/login?next=<ruta>`.
5. **Sign-out:** botón en la cabecera → `POST /api/auth/sign-out` → `/login`.
6. **Baja de un colaborador:** Gerencia lo desactiva en `/configuracion/usuarios` (borra sus
   sesiones; efecto inmediato), **y además** el barrido diario `entra-sync` (paso 12) consulta
   `GET https://graph.microsoft.com/v1.0/users/{email}?$select=accountEnabled` y desactiva a quien
   Entra marque como deshabilitado o no exista. Cuentas desactivadas no se borran: conservan su
   historia y su cartera, que Gerencia reasigna.
7. **Modo de prueba E2E:** con `AUTH_TEST_MODE=1` se habilita además email+password **solo** para
   direcciones `@e2e.tekinsof.test`, y el campo `role` es aceptado en el alta. `src/lib/env.ts`
   aborta el arranque si `AUTH_TEST_MODE=1` y `VERCEL_ENV=production`.

### Route protection

| Surface | Rule | Enforced where |
|---|---|---|
| `/` y `/(app)/*` sin cookie de sesión | redirección optimista a `/login?next=…` | `apps/crm/src/proxy.ts` |
| `/(app)/*` | sesión válida **y** `users.is_active = true`; si no, redirige a `/login` | `apps/crm/src/app/(app)/layout.tsx` → `requireActor()` en `src/lib/actor.ts` |
| Cada server action y route handler privado | `requirePermission(permiso, recurso?)` antes del trabajo | `src/lib/actor.ts`, llamado en cada acción |
| `/configuracion/usuarios` | `users.manage` | página + acciones |
| `/api/public/leads` | `Origin` = `SITE_ORIGIN` + Turnstile válido | `src/app/api/public/leads/route.ts` |
| `/api/inngest` | firma de Inngest | `serve()` de `inngest/next` |
| `/api/cotizaciones/[id]/pdf` | `quotes.read` | el route handler |

**Regla de aplicación:** la autorización se verifica en el servidor en cada petición. `proxy.ts`
solo mira si existe la cookie (es una comodidad); las server actions son POST a la ruta que las usa,
así que cada una autoriza por sí misma. Un botón oculto no es un permiso.

### Roles and permissions

Escalón 2 de `knowledge/capabilities/auth.md`: mapa rol → permisos **en código**
(`packages/core/src/auth/permissions.ts`), comprobado por un único `can(actor, permiso, recurso?)`.
Los permisos `*_own` exigen que `recurso.ownerId === actor.id`.

| Role | Can | Cannot |
|---|---|---|
| gerencia | todo: `users.manage`, `settings.manage`, `leads.*`, `leads.assign`, `accounts.*`, `opportunities.write_any`, `quotes.write_any`, `quotes.approve`, `quotes.send_any`, `catalog.write`, `campaigns.write`, `landings.write`, `landings.publish` | degradar o desactivar al último gerencia activo |
| ventas | `leads.read`, `leads.create`, `leads.update_own`, `accounts.read`, `accounts.write`, `opportunities.read`, `opportunities.write_own`, `quotes.read`, `quotes.write_own`, `quotes.send_own`, `catalog.read` | aprobar descuentos > 10%, editar oportunidades/cotizaciones ajenas, reasignar leads, publicar, gestionar usuarios |
| marketing | `leads.read`, `leads.create`, `accounts.read`, `opportunities.read`, `quotes.read`, `catalog.read`, `catalog.write`, `campaigns.write`, `landings.write`, `landings.publish` | cambiar estados de leads ajenos, cotizar, aprobar, gestionar usuarios |
| administracion | `leads.read`, `accounts.read`, `accounts.write`, `opportunities.read`, `quotes.read`, `catalog.read` | crear o editar leads, oportunidades y cotizaciones; publicar; gestionar usuarios |

Catálogo cerrado de permisos (literal, en `permissions.ts`): `users.manage`, `settings.manage`,
`leads.read`, `leads.create`, `leads.update_own`, `leads.update_any`, `leads.assign`,
`accounts.read`, `accounts.write`, `opportunities.read`, `opportunities.write_own`,
`opportunities.write_any`, `quotes.read`, `quotes.write_own`, `quotes.write_any`, `quotes.approve`,
`quotes.send_own`, `quotes.send_any`, `catalog.read`, `catalog.write`, `campaigns.write`,
`landings.write`, `landings.publish`.

### Sessions

Cookie de sesión de Better Auth: `HttpOnly`, `Secure` en producción, `SameSite=Lax`, opaca y
referenciada en la tabla `sessions` (revocable con una escritura). `expiresIn` 43200 s (12 h),
`updateAge` 3600 s. CSRF: Better Auth valida `Origin` contra `BETTER_AUTH_URL` en sus endpoints; las
server actions de Next comparan `Origin` con `Host` por defecto. Sin tokens en `localStorage`.

### Multi-tenancy / row-level isolation

NOT APPLICABLE — una sola organización (Tekinsof); multi-tenant está excluido por el cliente. El
aislamiento que sí existe es por **rol y dueño**: todo acceso pasa por `can()` y los permisos `*_own`
comparan `ownerId`. Las políticas RLS de Supabase no se usan (la app se conecta con un rol de
servidor); la API REST pública de Supabase queda deshabilitada para el esquema `public` (§14).

---

## 9. BUILD ORDER

**Esta es la sección que el blueprint existe para producir.** Un constructor que sigue el §9 al pie
de la letra y se detiene cuando cada gate pasa a verde entrega el proyecto.

### The rules of a step

1. **Una sesión por paso.** Cada paso toca como máximo 5 archivos (un glob de salida generada, como
   `packages/core/drizzle/**`, cuenta como uno) y lleva de 2 a 6 criterios de aceptación.
2. **Cada paso trae cuatro campos:** `Do`, `Done when`, `Verify`, `Checkpoint`, en ese orden.
3. **"Done when" es observable y decidible por una máquina**, en forma EARS:
   **WHEN** `<disparador>` **THE SYSTEM SHALL** `<respuesta observable>`.
4. **"Se ve bien" está prohibido**, igual que *funciona*, *está implementado*, *está conectado*.
5. **`Verify` es shell literal** que sale con 0 cuando el paso es correcto. Todos los comandos corren
   **desde la raíz del proyecto**, bajo `set -e`. Un resultado esperado no-cero se escribe
   `status=0; cmd || status=$?; test "$status" -eq N`.
6. **Un paso no está terminado** hasta que pasan su `Verify` y los de todos los pasos anteriores.
7. **Checkpoint en cada paso:** `git add -A && git commit -m "step N: slug"` y `git tag step-NN-slug`.
   Si el paso N+1 sale mal: `git reset --hard step-NN-slug` y reintentar; nunca depurar hacia
   adelante sobre un checkpoint roto.
8. **Nunca saltar adelante.** Si el paso 7 se bloquea, detenerse y reportar.
9. **Ningún paso rompe el gate de uno anterior.** Las variables de entorno que un paso agrega ya
   existen en `.env.example` con valores locales desde el Bootstrap (§10), y `apps/crm/src/lib/env.ts`
   solo las exige todas cuando `VERCEL_ENV=production`.
10. **No se afirman conteos derivados.** Los gates verifican propiedades (cada tabla nombrada existe,
    cada ruta responde su estado), no cantidades.
11. **Un `Verify` nunca depende de su propio `Checkpoint`.** Nada de `git status --porcelain` sobre
    archivos que el mismo paso creó.
12. **Toda E2E corre contra el build de producción** (`pnpm --filter @tekinsof/crm build` antes de
    `test:e2e`) con PGlite en `.data/e2e`, recreada en cada corrida por `playwright.config.ts`.

### One step, one unit — the counting rule

**Un paso del §9 = una tarea de `tasks.json` = un bloque de tarea en un epic.** 18 pasos → 3 epics
de 6 pasos: `01-fundaciones` (pasos 1–6), `02-captacion` (pasos 7–12), `03-conversion-y-campanas`
(pasos 13–18).

### Step map

| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 1 | scaffold — monorepo arranca: CRM con `/api/health`, sitio con portada provisional | — | 5 archivos de app | `pnpm --filter @tekinsof/crm test:e2e e2e/health.spec.ts` |
| 2 | data-layer — esquema completo R1, cliente, migración inicial | 1 | `packages/core/src/db/*`, `result.ts`, test, `drizzle/**` | `pnpm --filter @tekinsof/core test test/schema.test.ts` |
| 3 | core-users — permisos, auditoría, invitaciones y admisión | 2 | 5 archivos de core | `pnpm --filter @tekinsof/core test test/users.test.ts` |
| 4 | auth-crm — Better Auth + Entra, login, env del CRM | 3 | 5 archivos del CRM | `pnpm --filter @tekinsof/crm test:e2e e2e/auth.spec.ts` |
| 5 | shell-guard — guardia de sesión, proxy, layout con navegación por permiso y tema | 4 | 5 archivos del CRM | `pnpm --filter @tekinsof/crm test:e2e e2e/shell.spec.ts` |
| 6 | users-admin — primitivas UI, gestión de usuarios, límite de error | 5 | 5 archivos del CRM | `pnpm --filter @tekinsof/crm test:e2e e2e/users.spec.ts` |
| 7 | accounts — empresas y contactos | 6 | core + 3 páginas | `pnpm --filter @tekinsof/core test test/accounts.test.ts` |
| 8 | leads-core — servicio de leads y actividades, endpoint público | 3 | core + ruta pública + E2E | `pnpm --filter @tekinsof/crm test:e2e e2e/public-leads.spec.ts` |
| 9 | leads-ui — bandeja, detalle, alta rápida (WhatsApp) | 6, 8 | 3 páginas + E2E | `pnpm --filter @tekinsof/crm test:e2e e2e/leads.spec.ts` |
| 10 | site-base — portada, formulario con Turnstile/UTM, WhatsApp, consentimiento | 8 | 5 archivos del sitio | `pnpm --filter @tekinsof/web build` + greps del HTML |
| 11 | automation — Graph, Inngest, asignación por rotación y avisos | 8 | core + Inngest | `pnpm --filter @tekinsof/core test test/lead-created.test.ts` |
| 12 | sweeps — horas laborables, SLA, recordatorios, vencimientos, outbox, Entra, deploy del sitio | 11 | core + registro Inngest | `pnpm --filter @tekinsof/core test test/business-hours.test.ts` |
| 13 | pipeline — oportunidades, kanban accesible, detalle | 9 | core + 3 archivos UI | `pnpm --filter @tekinsof/core test test/opportunities.test.ts` |
| 14 | quotes-core — cálculo y ciclo de vida de cotizaciones | 13 | 4 archivos de core | `pnpm --filter @tekinsof/core test test/quote-math.test.ts` |
| 15 | quotes-ui — catálogo, lista y editor de cotizaciones | 12, 14 | core + 3 páginas + E2E | `pnpm --filter @tekinsof/crm test:e2e e2e/quotes.spec.ts` |
| 16 | quote-delivery — PDF, almacenamiento, envío por Graph | 15 | core + ruta PDF + página | `pnpm --filter @tekinsof/core test test/quote-delivery.test.ts` |
| 17 | cms-landings — campañas, bloques, editor con vista previa, publicar | 12 | core + 2 páginas | `pnpm --filter @tekinsof/core test test/landings.test.ts` |
| 18 | site-dynamic — servicios y landings desde la base, seed | 10, 17 | sitio + `seed.ts` | `pnpm --filter @tekinsof/web build` + greps del HTML |

Orden: andamiaje → datos → identidad → la primera rebanada vertical de valor (lead del sitio →
bandeja → asignación → SLA) → conversión (pipeline, cotizaciones) → publicación de campañas. El
paso 1 ya **ejecuta** el CRM construido (`next start` + petición a `/api/health`) y el sitio construido
(HTML en `apps/web/dist`), de modo que cualquier desacuerdo entre los manifiestos y los configs de
build aparece en el primer gate.

---

#### Step 1 — Scaffold the monorepo and run both apps

**Do**

El Bootstrap (§10) ya copió `workspace/` (manifiestos, configs, `.env`) e instaló dependencias.
Este paso crea los primeros archivos de aplicación, con este contenido exacto:

- `apps/crm/src/app/globals.css`

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/plus-jakarta-sans";

/* Class-based dark mode: <html class="dark"> or <html class="light"> set from the `theme` cookie.
   With no class, the OS preference decides (media query below). */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --surface: #f7f7f8;
  --surface-accent: #e7dbe7;
  --border: #e2e3e7;
  --fg: #1e2126;
  --fg-muted: #5b606b;
  --primary: #1e2126;
  --primary-fg: #ffffff;
  --accent: #ff7f5c;
  --accent-fg: #1e2126;
  --link: #c2452a;
  --focus: #c2452a;
  --destructive: #b42318;
  --success: #067647;
  --warning: #b54708;
}

.dark {
  --background: #121417;
  --surface: #1e2126;
  --surface-accent: #2c2530;
  --border: #2e323a;
  --fg: #ecedee;
  --fg-muted: #a3a8b3;
  --primary: #ecedee;
  --primary-fg: #121417;
  --accent: #ff7f5c;
  --accent-fg: #121417;
  --link: #ff9c80;
  --focus: #ff9c80;
  --destructive: #f97066;
  --success: #47cd89;
  --warning: #fdb022;
}

@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: #121417;
    --surface: #1e2126;
    --surface-accent: #2c2530;
    --border: #2e323a;
    --fg: #ecedee;
    --fg-muted: #a3a8b3;
    --primary: #ecedee;
    --primary-fg: #121417;
    --accent: #ff7f5c;
    --accent-fg: #121417;
    --link: #ff9c80;
    --focus: #ff9c80;
    --destructive: #f97066;
    --success: #47cd89;
    --warning: #fdb022;
  }
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-accent: var(--surface-accent);
  --color-border: var(--border);
  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-primary: var(--primary);
  --color-primary-fg: var(--primary-fg);
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-link: var(--link);
  --color-focus: var(--focus);
  --color-destructive: var(--destructive);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --font-display:
    "Plus Jakarta Sans Variable", "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --radius-control: 10px;
  --radius-card: 14px;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* biome-ignore lint/complexity/noImportantStyles: reduced motion must override every utility class */
    animation-duration: 0.01ms !important;
    /* biome-ignore lint/complexity/noImportantStyles: reduced motion must override every utility class */
    transition-duration: 0.01ms !important;
  }
}
```

- `apps/crm/src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tekinsof CRM", template: "%s · Tekinsof CRM" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const themeClass = theme === "dark" || theme === "light" ? theme : undefined;
  return (
    <html lang="es-PE" className={themeClass}>
      <body className="min-h-dvh bg-background font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
```

- `apps/crm/src/app/api/health/route.ts`

```ts
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "crm",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  });
}
```

- `apps/crm/e2e/health.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test("GET /api/health responde 200 con status ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string; service: string };
  expect(body.status).toBe("ok");
  expect(body.service).toBe("crm");
});

test("una ruta inexistente responde 404", async ({ request }) => {
  const res = await request.get("/ruta-que-no-existe");
  expect(res.status()).toBe(404);
});
```

- `apps/web/src/pages/index.astro` (provisional; el paso 10 lo reemplaza)

```astro
---
const title = "Tekinsof Consulting | Tecnología y marketing digital para empresas";
const description =
  "Desarrollo de software, integración ERP/CRM, Power BI, Microsoft 365, ciberseguridad y marketing digital para empresas en Perú.";
---

<html lang="es-PE">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href="https://tekinsof.com/" />
  </head>
  <body>
    <main>
      <h1>Tekinsof Consulting</h1>
      <p>Tu mejor agente de cambios tecnológicos.</p>
    </main>
  </body>
</html>
```

**Done when**
- [ ] WHEN `pnpm typecheck` runs at the repository root THE SYSTEM SHALL exit 0 for `@tekinsof/core`, `@tekinsof/crm` (tsc) and `@tekinsof/web` (astro check).
- [ ] WHEN `pnpm lint` runs at the repository root with the bundle present under `blueprints/` THE SYSTEM SHALL exit 0.
- [ ] WHEN `pnpm build` runs THE SYSTEM SHALL exit 0 and write `apps/web/dist/index.html` containing the text `Tekinsof Consulting`.
- [ ] WHEN the built CRM is started by Playwright and `GET /api/health` is requested THE SYSTEM SHALL respond 200 with JSON `status` = `"ok"` and `service` = `"crm"`.
- [ ] WHEN the built CRM receives `GET /ruta-que-no-existe` THE SYSTEM SHALL respond 404.

**Verify**
```bash
pnpm install --frozen-lockfile                                # expect: exit 0, lockfile unchanged
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm build                                                    # expect: exit 0 (crm + web)
grep -q "Tekinsof Consulting" apps/web/dist/index.html        # expect: exit 0 — the static site was produced
pnpm --filter @tekinsof/crm test:e2e e2e/health.spec.ts       # expect: exit 0 — starts `next start`, 2 tests pass
```

**Checkpoint**
```bash
git add -A && git commit -m "step 1: scaffold"
git tag step-01-scaffold
# rollback target if step 2 goes wrong: git reset --hard step-01-scaffold
```

---

#### Step 2 — Data layer: full Release 1 schema, client and first migration

**Do**

Crear, con este contenido exacto:
- `packages/core/src/db/schema.ts` — el bloque completo del §4 (*Schema*).
- `packages/core/src/db/client.ts`

```ts
// The only module that opens a database connection. Everything else receives a `Db` (or a `Tx`).
// `pglite://memory` → in-memory PGlite · `pglite://<dir>` → embedded PGlite on disk (local dev and
// E2E; relative dirs resolve against the repository root) · `postgres://…` → Postgres (Supabase
// pooler in production, opened with prepare:false for transaction-mode pooling).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export { schema };
export type Db = ReturnType<typeof drizzlePostgres<typeof schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(coreDir, "../..");
export const migrationsFolder = join(coreDir, "drizzle");

export function resolvePgliteDir(url: string): string | undefined {
  const target = url.slice("pglite://".length);
  if (target === "memory") return undefined;
  return isAbsolute(target) ? target : join(repoRoot, target);
}

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  if (url.startsWith("pglite://")) {
    const dataDir = resolvePgliteDir(url);
    if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite does not create parent directories
    const client = new PGlite(dataDir);
    const db = drizzlePglite({ client, schema, casing: "snake_case" });
    return { db: db as unknown as Db, close: () => client.close() };
  }
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzlePostgres({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end() };
}

// Tests only: a fresh in-memory PGlite with every migration in packages/core/drizzle applied.
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    throw new Error("No migrations found: run `pnpm db:generate` first");
  }
  const client = new PGlite();
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

const globalForDb = globalThis as unknown as { tekinsofDb?: Db };

// Process-wide singleton for the apps. Survives Next dev hot reloads via globalThis.
// During `next build` route modules are imported in parallel workers only to read their config;
// nothing may open the real database (or a shared PGlite directory) then, so the build gets an
// in-memory PGlite.
export function getDb(): Db {
  const url =
    process.env.NEXT_PHASE === "phase-production-build"
      ? "pglite://memory"
      : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForDb.tekinsofDb ??= createDb(url).db;
  return globalForDb.tekinsofDb;
}
```

- `packages/core/src/result.ts`

```ts
import type { z } from "zod";

// One envelope for every service result and every JSON route (blueprint §5).
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CAPTCHA_FAILED"
  | "ORIGIN_NOT_ALLOWED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "APPROVAL_REQUIRED"
  | "INTERNAL";

export type AppError = { code: ErrorCode; message: string; fields?: Record<string, string> };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const httpStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  CAPTCHA_FAILED: 403,
  ORIGIN_NOT_ALLOWED: 403,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  APPROVAL_REQUIRED: 409,
  INTERNAL: 500,
};

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): Result<never> {
  return { ok: false, error: fields ? { code, message, fields } : { code, message } };
}

export function validationError(error: z.ZodError): Result<never> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return err("VALIDATION_ERROR", "Datos inválidos", fields);
}
```

- `packages/core/test/schema.test.ts`

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../src/db/client.ts";
import { auditEvents, leads, users } from "../src/db/schema.ts";

const tables = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "invitations",
  "app_settings",
  "holidays",
  "audit_events",
  "outbox",
  "companies",
  "contacts",
  "campaigns",
  "leads",
  "opportunities",
  "activities",
  "services",
  "quote_sequences",
  "quotes",
  "quote_items",
  "landing_pages",
  "site_publishes",
  "opportunity_services",
  "conversations",
  "messages",
];

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe("schema", () => {
  it.each(tables)("la tabla %s existe tras migrar", async (table) => {
    // Tests always run on PGlite, whose execute() result is { rows }.
    const result = (await db.execute(
      sql`select to_regclass(${`public.${table}`}) is not null as exists`,
    )) as unknown as { rows: Array<{ exists: boolean }> };
    expect(result.rows[0]?.exists).toBe(true);
  });

  it("rechaza un lead público sin consentimiento", async () => {
    await expect(
      db.insert(leads).values({ source: "web_form", fullName: "Ana", email: "ana@example.com" }),
    ).rejects.toThrow();
  });

  it("rechaza un lead sin email ni teléfono", async () => {
    await expect(
      db.insert(leads).values({ source: "manual", fullName: "Sin contacto" }),
    ).rejects.toThrow();
  });

  it("acepta un evento de auditoría con usuario", async () => {
    await db
      .insert(users)
      .values({ id: "u1", name: "Gerencia", email: "g@tekinsof.com", role: "gerencia" });
    const [row] = await db
      .insert(auditEvents)
      .values({ actorId: "u1", action: "user.invited", targetType: "user", targetId: "u2" })
      .returning();
    expect(row?.action).toBe("user.invited");
    expect(row?.metadata).toEqual({});
  });
});
```

- Ejecutar `pnpm db:generate`: drizzle-kit escribe la migración inicial y su metadata bajo
  `packages/core/drizzle/` con el nombre que elija (no renombrar). Se commitea.

**Done when**
- [ ] WHEN `pnpm db:generate` runs on the step-1 tree THE SYSTEM SHALL exit 0 and create `packages/core/drizzle/meta/_journal.json`.
- [ ] WHEN `pnpm --filter @tekinsof/core test test/schema.test.ts` runs THE SYSTEM SHALL apply every migration to an in-memory PGlite and find every table named in the test's `tables` array — the 24 `pgTable` definitions of §4, from `users` to `messages`.
- [ ] WHEN a `leads` row with `source = 'web_form'` and no `consent_at` is inserted THE SYSTEM SHALL reject it with a check-constraint error.
- [ ] WHEN a `leads` row has neither `email` nor `phone` THE SYSTEM SHALL reject it.
- [ ] WHEN `pnpm db:migrate` runs twice against `DATABASE_URL=pglite://.data/dev` from `.env` THE SYSTEM SHALL exit 0 both times.

**Verify**
```bash
pnpm db:generate                                              # expect: exit 0
test -f packages/core/drizzle/meta/_journal.json              # expect: exit 0 — the migration journal exists
pnpm --filter @tekinsof/core test test/schema.test.ts         # expect: exit 0, 0 failed
pnpm db:migrate                                               # expect: exit 0 — applies to .data/dev
pnpm db:migrate                                               # expect: exit 0 — second run is a no-op
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 2: data layer"
git tag step-02-data-layer
git ls-files --error-unmatch packages/core/drizzle/meta/_journal.json   # expect: exit 0 — the migration is committed
```

---

#### Step 3 — Core users: permissions, audit, invitations and admission

**Do**

Crear en `packages/core`:

- `src/auth/permissions.ts` — con este contenido exacto:

```ts
export const roles = ["gerencia", "ventas", "marketing", "administracion"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "users.manage",
  "settings.manage",
  "leads.read",
  "leads.create",
  "leads.update_own",
  "leads.update_any",
  "leads.assign",
  "accounts.read",
  "accounts.write",
  "opportunities.read",
  "opportunities.write_own",
  "opportunities.write_any",
  "quotes.read",
  "quotes.write_own",
  "quotes.write_any",
  "quotes.approve",
  "quotes.send_own",
  "quotes.send_any",
  "catalog.read",
  "catalog.write",
  "campaigns.write",
  "landings.write",
  "landings.publish",
] as const;
export type Permission = (typeof permissions)[number];

export type Actor = { id: string; email: string; role: Role };

const grants: Record<Role, readonly Permission[]> = {
  gerencia: permissions,
  ventas: [
    "leads.read",
    "leads.create",
    "leads.update_own",
    "accounts.read",
    "accounts.write",
    "opportunities.read",
    "opportunities.write_own",
    "quotes.read",
    "quotes.write_own",
    "quotes.send_own",
    "catalog.read",
  ],
  marketing: [
    "leads.read",
    "leads.create",
    "accounts.read",
    "opportunities.read",
    "quotes.read",
    "catalog.read",
    "catalog.write",
    "campaigns.write",
    "landings.write",
    "landings.publish",
  ],
  administracion: [
    "leads.read",
    "accounts.read",
    "accounts.write",
    "opportunities.read",
    "quotes.read",
    "catalog.read",
  ],
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

// `*_own` permissions apply only when the resource belongs to the actor; the matching `*_any`
// permission (if the role has it) always applies.
export function can(actor: Actor, permission: Permission, resource?: { ownerId: string | null }): boolean {
  const granted = grants[actor.role];
  if (permission.endsWith("_own")) {
    const anyPermission = permission.replace(/_own$/, "_any") as Permission;
    if (granted.includes(anyPermission)) return true;
    return granted.includes(permission) && resource !== undefined && resource.ownerId === actor.id;
  }
  return granted.includes(permission);
}
```

- `src/audit/audit.ts` — con este contenido exacto:

```ts
import type { DbOrTx } from "../db/client.ts";
import { auditEvents } from "../db/schema.ts";

export type AuditInput = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

// Call inside the same transaction as the change it records. `action` is a stable `object.verb`
// contract (e.g. `user.invited`): never rename an existing action.
export async function writeAudit(tx: DbOrTx, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
    requestId: input.requestId ?? null,
  });
}
```

- `src/users/users.ts` — exporta, todas validando con zod y devolviendo `Result` de `../result.ts`:
  - `admitUser(db, { email, requestedRole, testMode, bootstrapEmail, allowedDomain }): Promise<Result<{ role: Role; invitationId: string | null }>>`
    — regla, en este orden: email en minúsculas; si es `bootstrapEmail` → `gerencia`; si
    `testMode` y termina en `@e2e.tekinsof.test` → `requestedRole` si `isRole`, si no `ventas`; si no
    termina en `@<allowedDomain>` → `FORBIDDEN` (`"Dominio no permitido"`); si hay una invitación
    con ese email, `accepted_at` y `revoked_at` nulos → su rol y su id; si no → `FORBIDDEN`
    (`"Sin invitación"`).
  - `markInvitationAccepted(db, email): Promise<void>` — fija `accepted_at = now()` de la invitación vigente.
  - `inviteUser(db, actor, { email, role }): Promise<Result<{ invitationId: string }>>` — requiere
    `can(actor, "users.manage")` (si no, `FORBIDDEN`); email del dominio permitido (pasa
    `allowedDomain` como tercer argumento `opts`); `CONFLICT` si ya existe un usuario o una invitación
    vigente con ese email; inserta y escribe `user.invited` en la misma transacción.
  - `setUserRole(db, actor, { userId, role })`, `deactivateUser(db, actor, { userId })`,
    `reactivateUser(db, actor, { userId })` — requieren `users.manage`; `FORBIDDEN` si la operación
    deja **cero** usuarios activos con rol `gerencia`; `deactivateUser` pone `is_active = false` y
    borra las filas de `sessions` del usuario; auditoría `user.role_changed` (metadata
    `{ from, to }`), `user.deactivated`, `user.reactivated`.
  - `listUsers(db)` y `listPendingInvitations(db)` para la pantalla del paso 6.
- `test/permissions.test.ts` — verifica: ventas puede `leads.update_own` sobre `{ ownerId: actor.id }`
  y no sobre `{ ownerId: "otro" }`; gerencia puede `quotes.approve` y `leads.update_own` sobre un
  recurso ajeno (vía `_any`); marketing no puede `quotes.write_own`; administracion no puede
  `leads.create`; `isRole("admin")` es `false`.
- `test/users.test.ts` — sobre `createTestDb()`: el email de bootstrap recibe `gerencia`; un email
  `@tekinsof.com` sin invitación → `FORBIDDEN`; con invitación `marketing` → `marketing`; un email
  `@gmail.com` → `FORBIDDEN` aun con invitación; `inviteUser` por un `ventas` → `FORBIDDEN`;
  desactivar al único gerencia → `FORBIDDEN`; `inviteUser` deja exactamente una fila `user.invited`
  en `audit_events`.

**Done when**
- [ ] WHEN a `ventas` actor is checked for `leads.update_own` on a resource whose `ownerId` is another user THE SYSTEM SHALL return false, and true when the `ownerId` is the actor's own id.
- [ ] WHEN `admitUser` runs for an `@tekinsof.com` email with no pending invitation THE SYSTEM SHALL return `{ ok: false, error.code: "FORBIDDEN" }`.
- [ ] WHEN `admitUser` runs for the bootstrap email THE SYSTEM SHALL return role `gerencia` without needing an invitation.
- [ ] WHEN `deactivateUser` targets the only active `gerencia` user THE SYSTEM SHALL return `FORBIDDEN` and leave `is_active` true.
- [ ] WHEN `inviteUser` succeeds THE SYSTEM SHALL write one `invitations` row and one `audit_events` row with `action = 'user.invited'` in the same transaction.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/permissions.test.ts    # expect: exit 0, 0 failed
pnpm --filter @tekinsof/core test test/users.test.ts          # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 3: core users"
git tag step-03-core-users
```

---

#### Step 4 — Auth in the CRM: Better Auth + Microsoft Entra ID, login, validated env

**Do**

Crear en `apps/crm`:

- `src/lib/env.ts` — exporta `parseEnv(source: Record<string, string | undefined>)` (zod; lanza un
  `Error` cuyo mensaje nombra cada variable inválida o faltante) y `getEnv()` (memoiza
  `parseEnv(process.env)` en la primera llamada). Solo importa `zod`. Campos
  (todos documentados en §10): `DATABASE_URL` (requerido), `BETTER_AUTH_SECRET` (min 32),
  `BETTER_AUTH_URL` (`z.url()`), `CRM_BOOTSTRAP_ADMIN_EMAIL` (`z.email()`), `ALLOWED_EMAIL_DOMAIN`
  (default `tekinsof.com`), `AUTH_TEST_MODE` (`"0"|"1"`, default `"0"`, transformado a boolean),
  `VERCEL_ENV` (opcional), y como **opcionales con default local**: `ENTRA_TENANT_ID`,
  `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `SITE_ORIGIN` (default `http://localhost:4321`),
  `TURNSTILE_SECRET_KEY` (default `1x0000000000000000000000000000000AA`), `MAIL_DRIVER`
  (`graph|log`, default `log`), `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
  `GRAPH_SYSTEM_SENDER`, `CRM_BASE_URL` (default `http://localhost:3000`), `STORAGE_DRIVER`
  (`supabase|local`, default `local`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VERCEL_DEPLOY_HOOK_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Después del `safeParse`
  base y **en código plano** (no con `superRefine`, que zod omite cuando otro campo ya falló),
  `parseEnv` acumula un mensaje por cada problema cuando `VERCEL_ENV === "production"`: (a)
  `AUTH_TEST_MODE no se permite en producción` si es true; (b) `<VARIABLE> es obligatoria en
  producción` por cada una ausente de `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`,
  `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SYSTEM_SENDER`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_DEPLOY_HOOK_URL`, `INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`; (c) `MAIL_DRIVER debe ser graph`, `STORAGE_DRIVER debe ser supabase`,
  `TURNSTILE_SECRET_KEY no puede ser una clave de prueba` (prefijo `1x` o `2x`). Si hay mensajes, lanza
  `new Error("Configuración inválida: " + mensajes.join("; "))`. Nada más en el CRM lee `process.env`.
- `src/lib/auth.ts` — con este contenido exacto:

```ts
import { getDb, schema } from "@tekinsof/core/db/client";
import { admitUser, markInvitationAccepted } from "@tekinsof/core/users/users";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "./env";

const env = getEnv();

const microsoft =
  env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.ENTRA_TENANT_ID
    ? {
        microsoft: {
          clientId: env.ENTRA_CLIENT_ID,
          clientSecret: env.ENTRA_CLIENT_SECRET,
          tenantId: env.ENTRA_TENANT_ID,
          prompt: "select_account" as const,
        },
      }
    : undefined;

export const auth = betterAuth({
  appName: "Tekinsof CRM",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "ventas", input: env.AUTH_TEST_MODE },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  emailAndPassword: { enabled: env.AUTH_TEST_MODE, autoSignIn: true },
  socialProviders: microsoft,
  onAPIError: { errorURL: "/login" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const decision = await admitUser(getDb(), {
            email: user.email,
            requestedRole: typeof user.role === "string" ? user.role : undefined,
            testMode: env.AUTH_TEST_MODE,
            bootstrapEmail: env.CRM_BOOTSTRAP_ADMIN_EMAIL,
            allowedDomain: env.ALLOWED_EMAIL_DOMAIN,
          });
          if (!decision.ok) return false;
          return { data: { ...user, email: user.email.toLowerCase(), role: decision.data.role } };
        },
        after: async (user) => {
          await markInvitationAccepted(getDb(), user.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
```

- `src/app/api/auth/[...all]/route.ts` — `import { toNextJsHandler } from "better-auth/next-js";`
  `import { auth } from "@/lib/auth";` `export const { GET, POST } = toNextJsHandler(auth);`
- `src/app/login/page.tsx` — server component. Muestra el logo textual "Tekinsof CRM", un botón
  **"Entrar con Microsoft"** dentro de un `<form>` cuya server action llama
  `auth.api.signInSocial({ body: { provider: "microsoft", callbackURL: next ?? "/leads" }, headers: await headers() })`
  y hace `redirect(result.url)`; si `searchParams.error` existe, muestra en `role="alert"`:
  "Tu cuenta no tiene acceso al CRM. Pide una invitación a Gerencia." Si `env.AUTH_TEST_MODE`,
  muestra además un formulario `email` + `password` (labels "Correo" y "Contraseña") cuya action
  llama `auth.api.signInEmail({ body, headers })` y redirige a `/leads`. Si no hay Entra configurado
  y no es modo test, el botón Microsoft aparece deshabilitado con el texto "Microsoft no configurado".
- `e2e/auth.spec.ts` — usa `loginAs` de `e2e/helpers/login.ts` (§19.6): (1) `loginAs(page, "gerencia")`
  y luego `GET /api/auth/get-session` responde 200 con `user.role === "gerencia"`; (2) un alta por
  `POST /api/auth/sign-up/email` con `intruso@gmail.com` **no** devuelve 200; (3) `GET /login`
  responde 200 y contiene el texto "Entrar con Microsoft"; (4) `GET /login?error=x` muestra el texto
  "no tiene acceso"; (5) sin navegador: `import { parseEnv } from "../src/lib/env"` y
  `expect(() => parseEnv({ DATABASE_URL: "pglite://memory", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost:3000", CRM_BOOTSTRAP_ADMIN_EMAIL: "g@tekinsof.com", VERCEL_ENV: "production", AUTH_TEST_MODE: "1" })).toThrow(/AUTH_TEST_MODE/)`.

**Done when**
- [ ] WHEN the bootstrap email signs up in test mode THE SYSTEM SHALL create a session whose user has `role = "gerencia"`.
- [ ] WHEN `intruso@gmail.com` attempts sign-up THE SYSTEM SHALL refuse it with a non-200 status and create no `users` row.
- [ ] WHEN `/login` is requested THE SYSTEM SHALL respond 200 with a button labelled "Entrar con Microsoft".
- [ ] WHEN `parseEnv` receives `VERCEL_ENV=production` together with `AUTH_TEST_MODE=1` THE SYSTEM SHALL throw an error whose message contains `AUTH_TEST_MODE`.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0 (reads .env from Bootstrap)
pnpm --filter @tekinsof/crm test:e2e e2e/auth.spec.ts         # expect: exit 0, 5 tests pass (test 5 checks parseEnv without a browser)
```

**Checkpoint**
```bash
git add -A && git commit -m "step 4: auth crm"
git tag step-04-auth-crm
```

---

#### Step 5 — Session guard, proxy, app layout with permission-filtered navigation and theme

**Do**

Crear en `apps/crm`:

- `src/lib/actor.ts` — exporta:
  - `getActor(): Promise<Actor | null>` — `auth.api.getSession({ headers: await headers() })`; si hay
    sesión, lee `users` (`id, email, role, isActive`) por id con `getDb()`; devuelve `null` si no hay
    fila, si `isActive` es false o si `role` no pasa `isRole`.
  - `requireActor(): Promise<Actor>` — `redirect("/login")` si `getActor()` es null.
  - `authorize(permission, resource?): Promise<Result<Actor>>` — para server actions: `UNAUTHENTICATED`
    o `FORBIDDEN` como `Result`, nunca lanza.
  - `requirePermissionPage(permission): Promise<Actor>` — para páginas: `notFound()` si no hay permiso.
- `src/proxy.ts` — `export function proxy(request: NextRequest)`: usa `getSessionCookie(request)` de
  `better-auth/cookies`; `/` redirige a `/leads` con cookie o a `/login` sin ella; cualquier otra ruta
  sin cookie redirige a `/login?next=<pathname>`. `export const config = { matcher: ["/((?!api|login|_next|favicon.ico).*)"] }`.
- `src/app/(app)/layout.tsx` — server component: `const actor = await requireActor()`; renderiza el
  shell: barra lateral de 248px (en `<nav aria-label="Principal">`) con enlaces visibles **solo** si
  `can(actor, …)`: Leads (`leads.read`) → `/leads`, Oportunidades (`opportunities.read`), Cotizaciones
  (`quotes.read`), Empresas y Contactos (`accounts.read`), Catálogo (`catalog.read`), Landings
  (`landings.write`), Usuarios (`users.manage`) → `/configuracion/usuarios`. Bajo 1024px la barra
  es un `<details>` (menú sin JS). Cabecera con nombre y rol del actor, botón "Salir" (form → POST
  `/api/auth/sign-out` vía server action `auth.api.signOut`) y un `<form>` de tema con tres botones
  (`light`, `dark`, `system`) cuya server action escribe la cookie `theme` (1 año, `sameSite: "lax"`)
  y hace `revalidatePath("/", "layout")`. `children` va dentro de `<main id="contenido">` envuelto en
  `<Suspense fallback={…}>` con un esqueleto de 8 filas. Primer elemento del body: enlace
  "Saltar al contenido" a `#contenido`.
- `src/app/(app)/leads/page.tsx` — provisional (el paso 9 lo reemplaza): `requirePermissionPage("leads.read")`
  y un `<h1>Leads</h1>` con el texto "Aún no hay leads".
- `e2e/shell.spec.ts`: (1) sin sesión, `page.goto("/leads")` termina en una URL que contiene `/login`;
  (2) con `loginAs(page,"ventas")`, en `/leads` el nav tiene un enlace "Leads" y **no** tiene
  "Usuarios"; (3) con `loginAs(page,"gerencia")` el nav tiene "Usuarios"; (4) tras pulsar el botón
  `dark`, `page.reload()` y `<html>` tiene la clase `dark`; (5) `@axe-core/playwright` sobre `/leads`
  no reporta violaciones `serious` ni `critical`.

**Done when**
- [ ] WHEN an anonymous browser opens `/leads` THE SYSTEM SHALL end on a URL containing `/login`.
- [ ] WHEN a `ventas` user views `/leads` THE SYSTEM SHALL render a navigation link "Leads" and no link "Usuarios".
- [ ] WHEN a `gerencia` user views `/leads` THE SYSTEM SHALL render the link "Usuarios".
- [ ] WHEN the user picks the dark theme and reloads THE SYSTEM SHALL serve `<html class="dark">` in the initial HTML.
- [ ] WHEN axe scans `/leads` THE SYSTEM SHALL report zero serious or critical violations.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/shell.spec.ts        # expect: exit 0, 5 tests pass
pnpm --filter @tekinsof/crm test:e2e e2e/auth.spec.ts         # expect: exit 0 — step 4 still green
```

**Checkpoint**
```bash
git add -A && git commit -m "step 5: shell guard"
git tag step-05-shell-guard
```

---

#### Step 6 — UI primitives, user administration and the segment error boundary

**Do**

Crear en `apps/crm`:

- `src/components/ui.tsx` — primitivas sin estado, con tokens del §7 y sin hex literales: `Button`
  (variantes `primary` = `bg-primary text-primary-fg`, `accent` = `bg-accent text-accent-fg`,
  `ghost`, `danger` = `bg-destructive text-white`; alto mínimo 36px; `rounded-[var(--radius-control)]`),
  `Field` (label + control + `<p role="alert">` del error + texto de ayuda enlazado por
  `aria-describedby`), `Input`, `Select`, `Textarea`, `Badge` (`neutral|accent|success|warning|danger`),
  `Card`, `Table` (cabecera `bg-surface`, filas de 44px, `tabular-nums` en columnas numéricas),
  `EmptyState` (título, texto, acción), `Pagination` (enlaces `?page=`). Menos de 300 líneas.
- `src/app/(app)/configuracion/usuarios/page.tsx` — `requirePermissionPage("users.manage")`; tabla
  de usuarios (nombre, correo, rol, activo, recibe leads) y de invitaciones pendientes; formulario
  "Invitar" (correo, rol); por fila: selector de rol y botón "Desactivar"/"Reactivar".
- `src/app/(app)/configuracion/usuarios/actions.ts` — `"use server"`; `inviteAction`, `setRoleAction`,
  `toggleActiveAction`: cada una llama `authorize("users.manage")`, luego al servicio del paso 3,
  devuelve el `Result` y hace `revalidatePath("/configuracion/usuarios")` si `ok`.
- `src/app/(app)/error.tsx` — `"use client"`; mensaje "Algo salió mal al cargar esta página." y botón
  "Reintentar" que llama `reset()`.
- `e2e/users.spec.ts`: (1) gerencia invita `nuevo.vendedor@tekinsof.com` con rol `ventas` y la fila
  aparece en "Invitaciones pendientes"; (2) invitar `alguien@gmail.com` muestra el error de campo
  "Dominio no permitido"; (3) un `ventas` que abre `/configuracion/usuarios` recibe 404; (4) axe sin
  violaciones serias en la página.

**Done when**
- [ ] WHEN a `gerencia` user submits an invitation for an `@tekinsof.com` address THE SYSTEM SHALL list it under pending invitations after the redirect.
- [ ] WHEN an invitation targets an address outside `ALLOWED_EMAIL_DOMAIN` THE SYSTEM SHALL show the field error "Dominio no permitido" and create no row.
- [ ] WHEN a `ventas` user requests `/configuracion/usuarios` THE SYSTEM SHALL respond 404.
- [ ] WHEN axe scans `/configuracion/usuarios` THE SYSTEM SHALL report zero serious or critical violations.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/users.spec.ts        # expect: exit 0, 4 tests pass
pnpm --filter @tekinsof/crm test:e2e e2e/shell.spec.ts        # expect: exit 0 — step 5 still green
```

**Checkpoint**
```bash
git add -A && git commit -m "step 6: users admin"
git tag step-06-users-admin
```

---

#### Step 7 — Accounts: companies and contacts

**Do**

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

**Done when**
- [ ] WHEN `createCompany` receives RUC `12345` THE SYSTEM SHALL return `VALIDATION_ERROR` with `fields.ruc` and insert nothing.
- [ ] WHEN a second company is created with an existing RUC THE SYSTEM SHALL return `CONFLICT`.
- [ ] WHEN a contact phone `987 654 321` is saved THE SYSTEM SHALL store `+51987654321`.
- [ ] WHEN a `marketing` actor calls `createCompany` THE SYSTEM SHALL return `FORBIDDEN`.
- [ ] WHEN a company is soft-deleted THE SYSTEM SHALL omit it from `listCompanies` while the row stays in the table.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/accounts.test.ts       # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0 — the three pages compile
```

**Checkpoint**
```bash
git add -A && git commit -m "step 7: accounts"
git tag step-07-accounts
```

---

#### Step 8 — Leads core: lead and activity services, public endpoint

**Do**

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

**Done when**
- [ ] WHEN a valid lead is posted from `SITE_ORIGIN` THE SYSTEM SHALL respond 201 with `{ ok: true, data: { leadId, deduplicated: false } }` and write one `leads` row and one `outbox` row named `lead/created`.
- [ ] WHEN the same email is posted again within 24 hours THE SYSTEM SHALL respond 200 with `deduplicated: true` and the original `leadId`, writing no new row.
- [ ] WHEN the `Origin` header differs from `SITE_ORIGIN` THE SYSTEM SHALL respond 403 with `error.code = "ORIGIN_NOT_ALLOWED"`.
- [ ] WHEN `consent` is not `true` THE SYSTEM SHALL respond 400 with `error.code = "VALIDATION_ERROR"` and `error.fields.consent` set.
- [ ] WHEN a `ventas` actor changes the status of a lead owned by another user THE SYSTEM SHALL return `FORBIDDEN`.
- [ ] WHEN a `llamada` activity is added to a `nuevo` lead THE SYSTEM SHALL set `first_contacted_at` and move the lead to `contactado`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/leads.test.ts          # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/public-leads.spec.ts # expect: exit 0, 6 tests pass
```

**Checkpoint**
```bash
git add -A && git commit -m "step 8: leads core"
git tag step-08-leads-core
```

---

#### Step 9 — Leads UI: inbox, detail and quick add for WhatsApp leads

**Do**

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

**Done when**
- [ ] WHEN a `ventas` user submits the quick-add form with name and a 9-digit phone THE SYSTEM SHALL create a `whatsapp` lead owned by that user and land on its detail page showing `+51987654321`.
- [ ] WHEN the status form moves a lead to `contactado` THE SYSTEM SHALL render the badge "Contactado" after the redirect.
- [ ] WHEN `descartado` is submitted without a reason THE SYSTEM SHALL show the field error "Indica el motivo" and leave the status unchanged.
- [ ] WHEN a lead arrives through the public endpoint THE SYSTEM SHALL list it in a `gerencia` user's `/leads` with origin "Formulario web".
- [ ] WHEN axe scans `/leads` THE SYSTEM SHALL report zero serious or critical violations.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/leads.spec.ts        # expect: exit 0, 6 tests pass
pnpm --filter @tekinsof/crm test:e2e e2e/shell.spec.ts        # expect: exit 0 — the placeholder it used is now the real page
```

**Checkpoint**
```bash
git add -A && git commit -m "step 9: leads ui"
git tag step-09-leads-ui
```

---

#### Step 10 — Public site base: home, lead form with Turnstile and UTM, WhatsApp, consent, privacy

**Do**

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
  "+51981053022", `address` (`streetAddress` "Av. La Molina 145", `addressLocality` "Ate",
  `addressRegion` "Lima", `addressCountry` "PE"). Cabecera: logo textual, enlaces "Servicios"
  (`/#servicios`), "Contacto" (`/#contacto`), botón `accent` "Agenda una reunión" a
  `PUBLIC_BOOKINGS_URL`. Pie con dirección, correo, teléfono y enlace "Política de privacidad"
  (`/privacidad`). Botón flotante de WhatsApp: `<a href="https://wa.me/<PUBLIC_WHATSAPP_NUMBER>?text=…">`
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
  (Tekinsof Consulting, Av. La Molina 145, Ate, Lima), datos que se recogen (los del formulario y
  los de WhatsApp), finalidad (atender la solicitud y comunicaciones comerciales relacionadas),
  conservación (24 meses desde el último contacto), destinatarios (proveedores de hosting y correo
  como encargados), derechos ARCO y cómo ejercerlos (info@tekinsof.com), versión "2026-10". El texto
  final lo valida el asesor legal del cliente (§20.1).

**Done when**
- [ ] WHEN `pnpm --filter @tekinsof/web build` runs THE SYSTEM SHALL exit 0 and emit `dist/index.html` and `dist/privacidad.html`.
- [ ] WHEN `dist/index.html` is inspected THE SYSTEM SHALL contain an `application/ld+json` block, a `wa.me/51981053022` link and a server-rendered form input named `fullName`.
- [ ] WHEN `dist/index.html` is inspected THE SYSTEM SHALL contain no request to `fonts.googleapis.com`.
- [ ] WHEN `dist/privacidad.html` is inspected THE SYSTEM SHALL contain the text `29733`.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0 (astro check included)
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/web build                             # expect: exit 0
grep -q "application/ld+json" apps/web/dist/index.html        # expect: exit 0
grep -q "wa.me/51981053022" apps/web/dist/index.html          # expect: exit 0
grep -q 'name="fullName"' apps/web/dist/index.html            # expect: exit 0 — the island is server-rendered
grep -q "29733" apps/web/dist/privacidad.html                 # expect: exit 0
status=0; grep -q "fonts.googleapis.com" apps/web/dist/index.html || status=$?; test "$status" -eq 1
                                                              # expect: 1 = no match → this line exits 0 · 2 = grep error, which fails
```

**Checkpoint**
```bash
git add -A && git commit -m "step 10: site base"
git tag step-10-site-base
```

---

#### Step 11 — Automation: Microsoft Graph mailer, Inngest, round-robin assignment and notifications

**Do**

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
     +51 981 053 022; `replyTo` = email del dueño.
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

**Done when**
- [ ] WHEN three leads are processed with two eligible sellers A (never assigned) and B (assigned yesterday) THE SYSTEM SHALL assign them A, B, A in that order.
- [ ] WHEN `handleLeadCreated` runs twice for the same lead THE SYSTEM SHALL keep the first owner and send no additional email.
- [ ] WHEN a web-form lead with an email is assigned to seller A THE SYSTEM SHALL send the acknowledgement with `from` equal to A's email and `to` equal to the prospect's email.
- [ ] WHEN no `ventas` user is active THE SYSTEM SHALL assign the lead to the first active `gerencia` user.
- [ ] WHEN the mailer returns an error THE SYSTEM SHALL keep the assignment and report `notified: false`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/lead-created.test.ts   # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0 — /api/inngest compiles
```

Un viaje real por Inngest Cloud y Microsoft Graph necesita cuentas y red: no es un gate de build; está
en la lista de lanzamiento (§20.1).

**Checkpoint**
```bash
git add -A && git commit -m "step 11: automation"
git tag step-11-automation
```

---

#### Step 12 — Sweeps: business hours, SLA, reminders, quote expiry, outbox, Entra sync, site deploy

**Do**

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

**Done when**
- [ ] WHEN `addBusinessHours` runs on each of the seven rows of the table above THE SYSTEM SHALL return exactly the expected UTC instant.
- [ ] WHEN `slaSweep` runs at 13:59 Lima for a lead created Monday 10:00 Lima THE SYSTEM SHALL send no alert, and at 14:01 Lima SHALL email every active `gerencia` user and set `sla_alerted_at`.
- [ ] WHEN `slaSweep` runs again with the same `now` THE SYSTEM SHALL process 0 leads.
- [ ] WHEN `flushOutbox`'s `send` fails THE SYSTEM SHALL increment `attempts` and keep `sent_at` null.
- [ ] WHEN `quoteExpirySweep` finds a sent quote whose `valid_until` was yesterday THE SYSTEM SHALL set its status to `vencida`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/business-hours.test.ts # expect: exit 0, 0 failed
pnpm --filter @tekinsof/core test test/sweeps.test.ts         # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 12: sweeps"
git tag step-12-sweeps
```

---

#### Step 13 — Pipeline: opportunities, accessible kanban, detail

**Do**

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

**Done when**
- [ ] WHEN a `calificado` lead is converted THE SYSTEM SHALL create one opportunity linked to it, create its contact (and company when the lead named one) and set the lead status to `convertido`.
- [ ] WHEN the same lead is converted a second time THE SYSTEM SHALL return `CONFLICT` and create nothing.
- [ ] WHEN a `ventas` actor moves an opportunity owned by another user THE SYSTEM SHALL return `FORBIDDEN`.
- [ ] WHEN an opportunity is closed as `perdida` without a reason THE SYSTEM SHALL return `VALIDATION_ERROR`.
- [ ] WHEN a card is moved to position 0 of a column holding three cards THE SYSTEM SHALL leave that column's positions exactly `[0, 1, 2, 3]`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/opportunities.test.ts  # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: pipeline"
git tag step-13-pipeline
```

---

#### Step 14 — Quotes core: arithmetic and lifecycle

**Do**

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

**Done when**
- [ ] WHEN `computeQuoteTotals` runs on each row of the table above THE SYSTEM SHALL return exactly the expected céntimos.
- [ ] WHEN a quote with a 10.01% discount is submitted THE SYSTEM SHALL set `pendiente_aprobacion` and write one `quote/approval.requested` outbox row; with 10% it SHALL set `aprobada`.
- [ ] WHEN a `ventas` actor calls `approveQuote` THE SYSTEM SHALL return `FORBIDDEN` and leave the status unchanged.
- [ ] WHEN `setQuoteItems` targets a quote that is not `borrador` THE SYSTEM SHALL return `INVALID_TRANSITION`.
- [ ] WHEN `newQuoteVersion` runs THE SYSTEM SHALL mark the old version `reemplazada` and create version 2 in `borrador` with the same number and items.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/quote-math.test.ts     # expect: exit 0, 0 failed
pnpm --filter @tekinsof/core test test/quotes.test.ts         # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 14: quotes core"
git tag step-14-quotes-core
```

---

#### Step 15 — Quotes UI: catalog, quote list and editor

**Do**

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

**Done when**
- [ ] WHEN a seller issues a PEN quote of 1 × 1000.00 with a 15% discount THE SYSTEM SHALL show Subtotal `1,000.00`, IGV (18%) `153.00`, Total `1,003.00` and the badge "Pendiente de aprobación".
- [ ] WHEN that seller views the pending quote THE SYSTEM SHALL render no "Aprobar" button.
- [ ] WHEN a `gerencia` user approves it THE SYSTEM SHALL show the badge "Aprobada".
- [ ] WHEN a `marketing` user marks a catalog service as published THE SYSTEM SHALL show "Publicado" on that row after the redirect.
- [ ] WHEN axe scans the quote editor THE SYSTEM SHALL report zero serious or critical violations.

**Verify**
```bash
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/quotes.spec.ts       # expect: exit 0, 4 tests pass
```

**Checkpoint**
```bash
git add -A && git commit -m "step 15: quotes ui"
git tag step-15-quotes-ui
```

---

#### Step 16 — Quote delivery: PDF, file storage, sending through Graph

**Do**

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

**Done when**
- [ ] WHEN `renderQuotePdf` runs for an approved quote THE SYSTEM SHALL return bytes starting with `%PDF-` and longer than 1000 bytes.
- [ ] WHEN `sendQuote` runs on a quote in `pendiente_aprobacion` THE SYSTEM SHALL return `APPROVAL_REQUIRED` and send nothing.
- [ ] WHEN `sendQuote` runs on an `aprobada` quote THE SYSTEM SHALL send one email from the owner's address with the PDF attached and set the quote to `enviada` with `sent_at`.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/quote-delivery.test.ts # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
pnpm --filter @tekinsof/crm test:e2e e2e/quotes.spec.ts       # expect: exit 0 — the editor still passes with the new controls
```

El envío real por Graph a un buzón externo necesita la cuenta de Microsoft 365: está en la lista de
lanzamiento (§20.1).

**Checkpoint**
```bash
git add -A && git commit -m "step 16: quote delivery"
git tag step-16-quote-delivery
```

---

#### Step 17 — CMS: campaigns, landing blocks, editor with preview, publish

**Do**

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

**Done when**
- [ ] WHEN a landing is saved with a hero title longer than 90 characters THE SYSTEM SHALL return `VALIDATION_ERROR` with the field key `blocks.0.title`.
- [ ] WHEN a landing contains two `form` blocks THE SYSTEM SHALL reject it with `VALIDATION_ERROR`.
- [ ] WHEN a `marketing` user publishes a valid landing THE SYSTEM SHALL set it `publicada` and write one `site_publishes` row and one `site/publish.requested` outbox row.
- [ ] WHEN a `ventas` user tries to publish THE SYSTEM SHALL return `FORBIDDEN`.
- [ ] WHEN a hero block is rendered with `Block` THE SYSTEM SHALL emit HTML containing its title.

**Verify**
```bash
pnpm --filter @tekinsof/core test test/landings.test.ts       # expect: exit 0, 0 failed
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
pnpm --filter @tekinsof/crm build                             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 17: cms landings"
git tag step-17-cms-landings
```

---

#### Step 18 — Dynamic site: catalog-driven service pages, landings, seed

**Do**

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

**Done when**
- [ ] WHEN `pnpm db:seed` runs twice on the migrated `.data/dev` database THE SYSTEM SHALL exit 0 both times (the unique `services.code` index makes a duplicate impossible).
- [ ] WHEN the site is built after seeding THE SYSTEM SHALL emit `dist/servicios/desarrollo-de-software.html` and SHALL NOT emit `dist/servicios/mesa-de-ayuda.html` (unpublished).
- [ ] WHEN the demo landing is published THE SYSTEM SHALL emit `dist/lp/demo-desarrollo-software.html` containing a `noindex` robots meta tag.
- [ ] WHEN the sitemap is generated THE SYSTEM SHALL list `/servicios/desarrollo-de-software` and no `/lp/` URL.
- [ ] WHEN the home page is built THE SYSTEM SHALL link to `/servicios/desarrollo-de-software`.

**Verify**
```bash
pnpm db:migrate                                               # expect: exit 0
pnpm db:seed                                                  # expect: exit 0 (SEED_DEMO=1 comes from .env)
pnpm db:seed                                                  # expect: exit 0 — idempotent
pnpm --filter @tekinsof/web build                             # expect: exit 0
test -f apps/web/dist/servicios/desarrollo-de-software.html   # expect: exit 0
status=0; test -f apps/web/dist/servicios/mesa-de-ayuda.html || status=$?; test "$status" -eq 1
                                                              # expect: 1 = not generated → this line exits 0
grep -q 'name="robots" content="noindex' apps/web/dist/lp/demo-desarrollo-software.html   # expect: exit 0
grep -q "servicios/desarrollo-de-software" apps/web/dist/sitemap-0.xml                     # expect: exit 0
status=0; grep -q "/lp/" apps/web/dist/sitemap-0.xml || status=$?; test "$status" -eq 1    # expect: 1 = no landing in the sitemap → exits 0
grep -q 'href="/servicios/desarrollo-de-software"' apps/web/dist/index.html                # expect: exit 0
pnpm typecheck                                                # expect: exit 0
pnpm lint                                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 18: site dynamic"
git tag step-18-site-dynamic
```

---

### 9.1 Parity and cutover

`tekinsof.com` existe hoy (GoDaddy Website Builder, una sola página). No hay código ni datos que
migrar: el CRM es nuevo y los leads de Excel se cargan a mano. Lo que sí se reemplaza es **el sitio
servido en el dominio**, así que esta sección define cómo cambiarlo sin perder posicionamiento ni
correo.

#### Parity set

| # | Comportamiento que se conserva | Cómo se prueba | Tolerancia |
|---|---|---|---|
| 1 | `https://tekinsof.com/` responde 200 con HTTPS válido | `curl -sS -o /dev/null -w "%{http_code}" https://tekinsof.com/` → `200` y `curl -vI` sin error de certificado | exacto |
| 2 | Datos de contacto (dirección, correo, WhatsApp) idénticos | `curl -s https://tekinsof.com/ \| grep -q "Av. La Molina 145"` y `grep -q "wa.me/51981053022"` | exacto |
| 3 | Enlace de reserva de Microsoft Bookings | `curl -s https://tekinsof.com/ \| grep -q "outlook.office365.com/book/"` | exacto |
| 4 | El correo de `@tekinsof.com` sigue llegando | `nslookup -type=MX tekinsof.com` devuelve `tekinsof-com.mail.protection.outlook.com` antes y después | exacto |
| 5 | `www.tekinsof.com` lleva a la versión canónica | `curl -sI https://www.tekinsof.com/` → 308/301 a `https://tekinsof.com/` | exacto |

**Período de sombra:** el sitio nuevo se publica primero en la URL de preview de Vercel y en
`nuevo.tekinsof.com` (CNAME temporal) durante 3 días hábiles; se corren las filas 2–3 contra esa URL.

#### Cutover

| Phase | What changes | Who is affected | Reversible by | Verify |
|---|---|---|---|---|
| dark launch | proyecto `tekinsof-web` en Vercel con `nuevo.tekinsof.com` | nadie | borrar el CNAME | filas 2–3 contra `https://nuevo.tekinsof.com` |
| full | en GoDaddy DNS: `A @` → IP de Vercel y `CNAME www` → `cname.vercel-dns.com`; **sin tocar** MX, TXT (SPF/verificación), `autodiscover` ni los CNAME de DKIM | todos los visitantes | volver a poner los valores anteriores de `A @` y `www` (anotados antes del cambio); TTL bajado a 600 s un día antes | filas 1–5 |
| decommission | baja del sitio de GoDaddy Website Builder | nadie | no instantáneo: re-publicar desde GoDaddy | — |

**Kill switch:** restaurar en GoDaddy los dos registros anteriores (`A @` y `CNAME www`); con TTL de
600 s el retorno total toma ≤ 10 minutos más la caché de los resolvedores.

#### Abort criteria

- [ ] WHEN `https://tekinsof.com/` returns anything other than 200 for 5 consecutive minutes after the switch THE SYSTEM SHALL be reverted to the previous DNS records.
- [ ] WHEN the MX lookup for `tekinsof.com` stops returning `tekinsof-com.mail.protection.outlook.com` THE SYSTEM SHALL have the DNS change reverted immediately.
- [ ] WHEN the form submission success rate (201/200 responses over all `POST /api/public/leads`) falls below 90% over 30 minutes after the switch THE SYSTEM SHALL be reverted until fixed.

#### Data migration

NOT APPLICABLE — no data migration. Las cuentas y prospectos que hoy viven en Excel se ingresan
desde el CRM (importación CSV es Release 2).

#### Decommission

Tras 30 días con las filas 1–5 en verde: dar de baja el plan de GoDaddy Website Builder (el dominio y
el DNS **siguen** en GoDaddy), guardar una captura del sitio anterior y eliminar
`nuevo.tekinsof.com`. Es un ítem de la lista de lanzamiento (§20.1), nunca un paso del §9.

---

## 10. Environment Setup

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc` = `24`; verificado con 24.22.x) | `node -v` → `v24.…` |
| pnpm | 12.14.0 (fijado en `packageManager`) | `pnpm -v` → `12.14.0` |
| Git | ≥ 2.40, con identidad configurada (los checkpoints hacen commits) | `git --version` y `git config user.email` no vacío |
| rsync (opcional; si falta se usa `cp -Rn`) | cualquiera | `rsync --version` |

Instalar pnpm con corepack en un directorio escribible (el `corepack enable` sin argumentos falla
con `EACCES` donde el directorio global no es escribible, gotcha del track):
`corepack enable --install-directory "$HOME/.local/bin" && corepack prepare pnpm@12.14.0 --activate`
(con `$HOME/.local/bin` en el `PATH`). En Windows se usa Git Bash para todos los comandos de este
blueprint.

### Accounts to create first

Ningún gate del §9 necesita estas cuentas (todo corre con PGlite, mailer `log`, almacenamiento local y
las claves de prueba de Turnstile). Se necesitan para el despliegue y la lista de lanzamiento (§20.1):

| Servicio | Para qué | Dónde | Lo usa |
|---|---|---|---|
| Vercel (plan Pro, uso comercial) | hosting de `apps/crm` y `apps/web` | https://vercel.com/signup | lanzamiento |
| Supabase (plan Pro, región `sa-east-1`) | Postgres + Storage de producción; un segundo proyecto para preview | https://supabase.com/dashboard | lanzamiento |
| Inngest | colas y cron | https://app.inngest.com/sign-up | lanzamiento |
| Cloudflare (Turnstile) | widget antispam (site key + secret) | https://dash.cloudflare.com/?to=/:account/turnstile | lanzamiento |
| Microsoft Entra ID (tenant de Tekinsof) | **App 1 "Tekinsof CRM"**: login (redirect `https://crm.tekinsof.com/api/auth/callback/microsoft`, cuentas "solo este directorio"). **App 2 "Tekinsof CRM Mailer"**: permisos de aplicación `Mail.Send` y `User.Read.All` con consentimiento de administrador, acotados con *RBAC for Applications* de Exchange Online a un grupo de seguridad con los buzones comerciales y `notificaciones@tekinsof.com` | https://entra.microsoft.com | lanzamiento |
| GoDaddy (DNS de `tekinsof.com`) | registros del §9.1 y `crm` | panel de dominios | lanzamiento |
| Google Analytics 4 / Meta / LinkedIn | IDs de píxel (opcionales) | consolas de cada plataforma | lanzamiento |

### Environment variables

Todas están en `.env.example` (emitido en §19.6) con un valor local que hace correr los gates sin
red. `apps/crm/src/lib/env.ts` exige las marcadas "prod" **solo** con `VERCEL_ENV=production`.

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `DATABASE_URL` | conexión de la app; local `pglite://.data/dev`; prod = pooler de Supabase (puerto 6543) | Supabase → Project Settings → Database → Connection pooling | 2 | sí |
| `DATABASE_URL_DIRECT` | migraciones en prod (puerto 5432); vacío en local | Supabase → Database → Direct connection | prod | sí |
| `SEED_DEMO` | `1` siembra la landing demo (paso 18); nunca en prod | — | 18 | no |
| `BETTER_AUTH_SECRET` | firma de sesiones (≥ 32 caracteres) | `openssl rand -base64 32` | 4 | sí |
| `BETTER_AUTH_URL` | URL pública del CRM | `https://crm.tekinsof.com` / local `http://localhost:3000` | 4 | no |
| `CRM_BOOTSTRAP_ADMIN_EMAIL` | primer usuario (`gerencia`) | Gerencia de Tekinsof | 4 | no |
| `ALLOWED_EMAIL_DOMAIN` | único dominio invitable | `tekinsof.com` | 4 | no |
| `AUTH_TEST_MODE` | `1` habilita email+password para `@e2e.tekinsof.test` (solo E2E) | — | 4 | no |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | login con Microsoft (App 1) | Entra → App registrations | prod | secret: sí |
| `SITE_ORIGIN` | único `Origin` aceptado por `/api/public/leads` | `https://tekinsof.com` / local `http://localhost:4321` | 8 | no |
| `TURNSTILE_SECRET_KEY` | verificación antispam; local = clave de prueba `1x…AA` | Cloudflare → Turnstile | 8 | sí |
| `MAIL_DRIVER` | `log` (local/tests) o `graph` (prod) | — | 11 | no |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | envío de correo y estado de cuentas (App 2) | Entra → App registrations | prod | secret: sí |
| `GRAPH_SYSTEM_SENDER` | buzón remitente de avisos internos | `notificaciones@tekinsof.com` | 11 | no |
| `CRM_BASE_URL` | enlaces en los correos | `https://crm.tekinsof.com` | 11 | no |
| `INNGEST_DEV` | `1` en local: el SDK habla con el dev server | — | 11 | no |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | envío de eventos y firma del endpoint | Inngest → Manage → Keys (o integración de Vercel) | prod | sí |
| `STORAGE_DRIVER` | `local` o `supabase` | — | 16 | no |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage de PDFs (solo servidor) | Supabase → Project Settings → API | prod | key: sí |
| `VERCEL_DEPLOY_HOOK_URL` | regenerar el sitio al publicar | Vercel → `tekinsof-web` → Settings → Git → Deploy Hooks | prod (usada desde 12) | sí |
| `PUBLIC_LEADS_API_URL` | endpoint al que postea el formulario | `https://crm.tekinsof.com/api/public/leads` | 10 | no |
| `PUBLIC_TURNSTILE_SITE_KEY` | widget del formulario; local = `1x00000000000000000000AA` | Cloudflare → Turnstile | 10 | no |
| `PUBLIC_WHATSAPP_NUMBER` | click-to-chat | `51981053022` | 10 | no |
| `PUBLIC_BOOKINGS_URL` | CTA "Agenda una reunión" | enlace actual de Microsoft Bookings | 10 | no |
| `PUBLIC_GA4_ID`, `PUBLIC_META_PIXEL_ID`, `PUBLIC_LINKEDIN_PARTNER_ID` | píxeles tras consentimiento (vacíos = sin banner) | consolas de anuncios | 10 | no |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PHASE`, `TEST_WORKER_INDEX` | los fijan Vercel, Next (`next build`) y Playwright (procesos worker) | — | — | no |

**Carga de variables, por herramienta:** Next (`next.config.ts`), Astro (`astro.config.mjs`),
`scripts/migrate.ts` y `scripts/seed.ts` cargan el `.env` de la raíz con `process.loadEnvFile` (las
variables ya exportadas ganan). Vitest no lee `.env` (los tests usan PGlite en memoria). Playwright
pasa su propio `env` literal al `webServer`. drizzle-kit `generate` no lee variables.

### Files that must be committed

| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `.env.example` | contrato de variables con valores locales | `!.env.example` después de `.env.*` (ya está en el `.gitignore` emitido) |
| `pnpm-lock.yaml` | instalación reproducible (`--frozen-lockfile`) | — no lo cubre ningún patrón |
| `packages/core/drizzle/**` | migraciones generadas | — no lo cubre ningún patrón |
| `.claude/**`, `CLAUDE.md`, `AGENTS.md` | configuración del agente | — no lo cubre ningún patrón |
| `.github/workflows/ci.yml` | pipeline | — no lo cubre ningún patrón |
| todos los archivos de `workspace/` (manifiestos y configs del §19.6) | los gates los necesitan en un checkout limpio | — no los cubre ningún patrón |
| `blueprints/tekinsof-plataforma-comercial/**` | el bundle y el estado de `tasks.json` | — no lo cubre ningún patrón |

### Bootstrap

Se ejecuta **desde la raíz del proyecto**, con el bundle ya ubicado en
`blueprints/tekinsof-plataforma-comercial/`. Es seguro correrlo dos veces.

```bash
# order matters: workspace copy (brings .gitignore + exceptions + every config) → local .env →
#                repo init → first commit → toolchain check → install → browsers
set -e
BUNDLE=blueprints/tekinsof-plataforma-comercial

# 1. Copy the bundle's workspace into the project root. Never clobber: once the build has run,
#    package.json, pnpm-workspace.yaml and every config may have changed (rsync exits 0 either way;
#    BSD cp -n exits 1 when it skips, which is the intended outcome, hence `|| true`).
if command -v rsync >/dev/null 2>&1; then
  rsync -a --ignore-existing "$BUNDLE/workspace/" ./
else
  cp -Rn "$BUNDLE/workspace/." ./ || true
fi

# 2. Local env file from the committed example — never overwrite an existing .env.
[ -f .env ] || cp .env.example .env

# 3. Repository and first commit (.gitignore is already in place from step 1 of this block).
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main
git rev-parse --verify HEAD >/dev/null 2>&1 || { git add -A && git commit -m "chore: scaffold"; }

# 4. Toolchain — fail early with a clear message instead of a confusing install error.
node -v | grep -q '^v24\.'
pnpm -v | grep -qx '12.14.0'

# 5. Install. pnpm 12 refuses unreviewed build scripts (ERR_PNPM_IGNORED_BUILDS); allowBuilds in
#    pnpm-workspace.yaml pre-approves the known ones, and approve-builds covers any the resolver adds.
pnpm install || { pnpm approve-builds --all && pnpm install; }

# 6. Browser for the E2E gates (Linux CI adds --with-deps).
pnpm --filter @tekinsof/crm exec playwright install chromium
```

La segunda ejecución: `rsync`/`cp -n` no tocan nada existente; `.env` existe; el repo y `HEAD`
existen; `pnpm install` con el lockfile ya escrito es un no-op; Playwright detecta el navegador
instalado. Sale con 0. El lockfile y cualquier cambio de `allowBuilds` se commitean en el paso 1.

---

## 11. Dependencies

Verificado contra el registro de npm (`https://registry.npmjs.org/-/package/<name>/dist-tags` y
`https://registry.npmjs.org/<name>/<version>`) el **2026-10-27**. Donde la última versión publicada
tenía menos de 7 días se fijó la versión anterior ya verificada por el track (`knowledge/runtime-tracks/ts-node.md`, 2026-10-17)
y se anota la última; pnpm 12 además rechaza por defecto versiones recién publicadas (edad mínima),
lo que se comprobó al ejecutar el Bootstrap. Todo se instala con el `pnpm install` del Bootstrap (§10) desde los
manifiestos emitidos en `workspace/` (§19.6); ningún paso del §9 instala paquetes.

### Runtime

| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| Node.js | 24 (LTS) | https://nodejs.org/en/about/previous-releases · `knowledge/runtime-tracks/ts-node.md` | 2026-10-27 | prerequisito (§10) | runtime; 26 pasa a LTS activo el 2026-10-28 — re-evaluar en R2 |
| pnpm | 12.14.0 | https://registry.npmjs.org/pnpm/12.14.0 (latest 12.15.0, publicado 2026-10-21) | 2026-10-27 | prerequisito (§10) | gestor de paquetes y workspaces |
| next | 16.4.2 | https://registry.npmjs.org/next/16.4.2 (latest 16.4.3, 2026-10-23); engines node ≥20.9.0 | 2026-10-27 | §10 Bootstrap | framework del CRM |
| react / react-dom | 19.3.1 | https://registry.npmjs.org/react/19.3.1 | 2026-10-27 | §10 Bootstrap | UI (CRM, islas del sitio, bloques, PDF) |
| astro | 7.4.0 | https://registry.npmjs.org/astro/7.4.0 (latest 7.4.2, 2026-10-21); engines node ≥22.22.0 | 2026-10-27 | §10 Bootstrap | sitio estático |
| @astrojs/react | 7.1.1 | https://registry.npmjs.org/@astrojs/react/7.1.1 (peer react ^19; node ≥22.23.4) | 2026-10-27 | §10 Bootstrap | islas y bloques React en Astro |
| @astrojs/sitemap | 3.7.4 | https://registry.npmjs.org/@astrojs/sitemap/3.7.4 | 2026-10-27 | §10 Bootstrap | `sitemap-index.xml` |
| drizzle-orm | 0.45.4 | https://registry.npmjs.org/drizzle-orm/0.45.4 (peer postgres ≥3, pglite ≥0.2.0) | 2026-10-27 | §10 Bootstrap | ORM; nunca `^1` (1.0 es RC) |
| postgres | 3.4.9 | https://registry.npmjs.org/postgres/3.4.9 | 2026-10-27 | §10 Bootstrap | driver Postgres (Supabase) |
| @electric-sql/pglite | 0.5.10 | https://registry.npmjs.org/@electric-sql/pglite/0.5.10 (publicado 2026-10-14; latest 0.5.12 del 2026-10-26 queda fuera de la edad mínima de pnpm 12) | 2026-10-27 | §10 Bootstrap | Postgres embebido para dev, tests y E2E |
| zod | 4.6.7 | https://registry.npmjs.org/zod/4.6.7 | 2026-10-27 | §10 Bootstrap | validación en cada frontera |
| better-auth | 1.7.10 | https://registry.npmjs.org/better-auth/1.7.10 (latest 1.7.14, 2026-10-26); peer drizzle-orm ^0.45.2, next ^16 | 2026-10-27 | §10 Bootstrap | auth (Entra ID, sesiones) |
| inngest | 4.26.0 | https://registry.npmjs.org/inngest/4.26.0 (peer zod ^4, next ≥12); API v4: triggers en la configuración. `pnpm peers check` informa un peer `@opentelemetry/api` no satisfecho **dentro** del árbol de Inngest: aviso conocido, no bloquea | 2026-10-27 | §10 Bootstrap | eventos y cron |
| @react-pdf/renderer | 4.9.0 | https://registry.npmjs.org/@react-pdf/renderer/4.9.0 (peer react ^19) | 2026-10-27 | §10 Bootstrap | PDF de cotizaciones |
| @supabase/supabase-js | 2.118.0 | https://registry.npmjs.org/@supabase/supabase-js/2.118.0 (node ≥22) | 2026-10-27 | §10 Bootstrap | Storage (solo servidor) |
| @dnd-kit/core / @dnd-kit/sortable | 6.3.1 / 10.0.0 | https://registry.npmjs.org/@dnd-kit/core/6.3.1 · https://registry.npmjs.org/@dnd-kit/sortable/10.0.0 | 2026-10-27 | §10 Bootstrap | kanban accesible |
| lucide-react | 1.59.0 | https://registry.npmjs.org/lucide-react/1.59.0 (publicado 2026-10-17; latest 1.62.0 del 2026-10-27) | 2026-10-27 | §10 Bootstrap | íconos de la navegación |
| @fontsource-variable/inter | 5.3.0 | https://registry.npmjs.org/@fontsource-variable/inter/5.3.0 | 2026-10-27 | §10 Bootstrap | fuente de UI auto-alojada |
| @fontsource-variable/plus-jakarta-sans | 5.3.0 | https://registry.npmjs.org/@fontsource-variable/plus-jakarta-sans/5.3.0 | 2026-10-27 | §10 Bootstrap | fuente de títulos auto-alojada |

### Development

| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| typescript | 6.0.3 | https://registry.npmjs.org/typescript/6.0.3 (latest 7.0.2: rompe tooling de Astro, ver track) | 2026-10-27 | §10 Bootstrap | tipos |
| @types/node | 24.19.2 | https://registry.npmjs.org/@types/node/24.19.2 | 2026-10-27 | §10 Bootstrap | tipos de Node 24 |
| @types/react / @types/react-dom | 19.3.0 | https://registry.npmjs.org/@types/react/19.3.0 | 2026-10-27 | §10 Bootstrap | tipos de React |
| @biomejs/biome | 2.5.15 | https://registry.npmjs.org/@biomejs/biome/2.5.15 (latest 2.6.3, 2026-10-24) | 2026-10-27 | §10 Bootstrap | lint + formato |
| drizzle-kit | 0.31.11 | https://registry.npmjs.org/drizzle-kit/0.31.11 | 2026-10-27 | §10 Bootstrap | genera migraciones |
| vitest | 5.0.5 | https://registry.npmjs.org/vitest/5.0.5 (peer vite ^6.4‖^7‖^8; node ^22.12‖^24) | 2026-10-27 | §10 Bootstrap | tests de core |
| vite | 8.3.4 | https://registry.npmjs.org/vite/8.3.4 | 2026-10-27 | §10 Bootstrap | peer de vitest |
| @playwright/test | 1.64.1 | https://registry.npmjs.org/@playwright/test/1.64.1 | 2026-10-27 | §10 Bootstrap | E2E |
| @axe-core/playwright | 4.14.0 | https://registry.npmjs.org/@axe-core/playwright/4.14.0 | 2026-10-27 | §10 Bootstrap | accesibilidad en E2E |
| tailwindcss / @tailwindcss/postcss / @tailwindcss/vite | 4.3.3 | https://registry.npmjs.org/tailwindcss/4.3.3 | 2026-10-27 | §10 Bootstrap | estilos (PostCSS en Next, Vite en Astro) |
| @astrojs/check | 0.9.12 | https://registry.npmjs.org/@astrojs/check/0.9.12 | 2026-10-27 | §10 Bootstrap | `astro check` (typecheck del sitio) |
| actions/checkout, pnpm/action-setup, actions/setup-node | v4 | UNVERIFIED — verify before use (GitHub Actions no está en npm) | 2026-10-27 | `.github/workflows/ci.yml` (§19.6) | CI |

### Deliberately not used

| Rejected | Instead | Why |
|---|---|---|
| Clerk / Supabase Auth / Auth.js | Better Auth | usuarios en nuestra base y sin costo por usuario; nunca dos proveedores de identidad |
| Prisma | Drizzle | un solo dueño del esquema, mismo código sobre PGlite y Postgres |
| shadcn CLI, Radix | HTML nativo + `ui.tsx` | presupuesto de archivos por paso; accesibilidad nativa |
| next-themes | cookie `theme` leída en el root layout | sin JS y sin destello de tema |
| TanStack Query, react-hook-form | server components + server actions + formularios nativos | no hay estado de servidor en el cliente que justificarlo |
| Turborepo | `pnpm -r` | dos apps y un paquete no necesitan caché de tareas |
| dotenv | `process.loadEnvFile` de Node 24 | una dependencia menos |
| date-fns / @date-fns/tz | `time/business-hours.ts` (Lima UTC−5 fijo) | el único cálculo de fechas del producto, probado con vectores |
| Resend / SendGrid | Microsoft Graph | los correos salen del Outlook de cada vendedor |
| Sentry (en R1) | logs de Vercel + historial de Inngest + uptime externo | se agrega al inicio de la Release 2 (§20.3, decisión 12) |

---

## 12. Deployment Strategy

### Hosting

Vercel, plan Pro, **región de funciones `gru1` (São Paulo)** junto a Supabase `sa-east-1`.

| Proyecto | Root Directory | Framework | Build command | Output |
|---|---|---|---|---|
| `tekinsof-crm` | `apps/crm` | Next.js | `node ../../packages/core/scripts/migrate.ts && pnpm build` | `.next` (automático) |
| `tekinsof-web` | `apps/web` | Astro | `pnpm build` | `dist` |

Ambos con "Include files outside the root directory" activo (monorepo) y Node 24. La instalación la
hace Vercel con pnpm (lee `packageManager`). Inngest se conecta con su integración de Vercel (inyecta
`INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY`) y sincroniza `https://crm.tekinsof.com/api/inngest`.

### Environments

| Environment | Branch | URL | Database | Third-party mode |
|---|---|---|---|---|
| Local | — | `http://localhost:3000` (CRM), `http://localhost:4321` (sitio) | PGlite `.data/dev` | mailer `log`, storage `local`, Turnstile de prueba, Inngest dev server |
| Preview | cualquier PR | URL automática de Vercel | proyecto Supabase **preview** (nunca producción) | `MAIL_DRIVER=log`, Turnstile de prueba, Inngest branch environment |
| Production | `main` | `https://crm.tekinsof.com`, `https://tekinsof.com` | Supabase producción (pooler 6543 en runtime, directa 5432 para migrar) | Graph real, Turnstile real, Inngest producción |

### CI/CD

Tier 1: `.github/workflows/ci.yml` (emitido en §19.6) corre en cada PR y en `main`:
`pnpm install --frozen-lockfile` → `cp .env.example .env` → `pnpm typecheck` → `pnpm lint` →
`pnpm test` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm build` → `playwright install --with-deps chromium`
→ `pnpm test:e2e`. Es el mismo gate del §20.1. Branch protection en `main`: CI verde obligatorio.
Vercel genera un preview por PR.

### Release and rollback

- Merge a `main` → Vercel construye y promueve. Las migraciones corren en el build del CRM; si
  fallan, el build falla y sigue sirviendo la versión anterior.
- Rollback de código: "Instant Rollback" del deployment anterior en Vercel (< 1 minuto). Ensayar una
  vez en preview antes del lanzamiento (§20.1).
- Migraciones solo hacia adelante; cambios destructivos en tres despliegues (expandir → migrar →
  contraer), nunca en el mismo deploy que el código que los necesita.

### Domain, DNS, TLS

DNS en GoDaddy (`ns69/ns70.domaincontrol.com`). Registros nuevos: `A @` → IP que indique Vercel,
`CNAME www` → `cname.vercel-dns.com` (con redirección 308 de `www` al apex configurada en Vercel),
`CNAME crm` → `cname.vercel-dns.com`. **No se tocan** `MX` (`tekinsof-com.mail.protection.outlook.com`),
los `TXT` (SPF, verificaciones), `autodiscover` ni los CNAME de DKIM de Microsoft 365. TLS
automático de Vercel. Procedimiento de cambio y reversión: §9.1. **Hallazgo previo:** el certificado
TLS actual de `tekinsof.com` (GoDaddy) venció el 2026-08-25; renovarlo no depende de este proyecto.

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | Vitest | lógica pura: `quote-math`, `business-hours`, `permissions` | `packages/core/test/` | cada commit (`pnpm test`) |
| Integration | Vitest + PGlite en memoria (`createTestDb()`) | servicios de core contra Postgres real con todas las migraciones: leads, asignación, sweeps, cotizaciones, landings, PDF | `packages/core/test/` | cada commit |
| E2E | Playwright + `@axe-core/playwright` contra `next start` con PGlite en `.data/e2e` | login, navegación por rol, usuarios, endpoint público, bandeja de leads, cotización con aprobación | `apps/crm/e2e/` | cada commit (CI) |
| Sitio | greps sobre `apps/web/dist` | HTML estático, JSON-LD, formulario, sitemap, noindex | Verify de los pasos 10 y 18 | cada commit (CI) |

### Critical flows to cover E2E
1. Un lead enviado desde el origen del sitio entra, se deduplica y aparece en la bandeja (pasos 8–9).
2. Login por rol y navegación filtrada por permisos; un `ventas` no ve ni abre administración (pasos 4–6).
3. Cotización con descuento > 10%: queda pendiente, el vendedor no puede aprobar, Gerencia aprueba (paso 15).

### Test data

Cada archivo de Vitest crea su propia PGlite en memoria con `createTestDb()` y la cierra en
`afterAll`; ningún test depende de otro ni del orden. Las E2E borran `.data/e2e` al cargar
`playwright.config.ts`, migran al levantar el servidor y crean sus usuarios con `loginAs` (emails
únicos por prueba salvo el de bootstrap). No hay servicio externo que provisionar: PGlite es el
"Postgres local" y el `.env.example` apunta a él (`DATABASE_URL=pglite://.data/dev`).

### What is deliberately not tested
- Llamadas reales a Microsoft Graph, Inngest Cloud, Turnstile y Supabase Storage: se prueban con
  drivers `log`/`local`, la emulación de las claves de prueba de Turnstile y fakes inyectados; el
  viaje real está en la lista de lanzamiento.
- El arrastre con mouse del kanban (lo cubre la alternativa por botones, probada por su acción de servidor).
- Diseño visual pixel a pixel: no hay snapshots visuales en R1.

---

## 14. Security & Secrets

| Concern | Control | Implemented in |
|---|---|---|
| Secret storage | variables de entorno de Vercel por entorno; nunca en el repo; `.env` ignorado | Vercel + `.gitignore` |
| Secret rotation | `BETTER_AUTH_SECRET` (invalida sesiones), secretos de Entra (expiran a los 24 meses: recordatorio en calendario), claves de Supabase/Inngest/Turnstile: rotar al salir alguien del equipo técnico; procedimiento en el README | README (lanzamiento) |
| Input validation | zod en cada servicio de core y en `env.ts`; el endpoint público valida antes de tocar la base | `packages/core/src/**`, `apps/crm/src/app/api/public/leads/route.ts` |
| Output encoding / XSS | React/Astro escapan por defecto; prohibido `dangerouslySetInnerHTML` y `set:html` salvo el JSON-LD (`JSON.stringify` de datos propios) | revisión + regla `.claude/rules/crm-ui.md` |
| SQL injection | solo Drizzle con parámetros; `sql\`\`` con interpolación de valores, nunca concatenación de strings | `packages/core` |
| AuthN / AuthZ | §8: Entra + invitación; `requireActor`/`authorize` en cada página y acción | `apps/crm/src/lib/actor.ts` |
| CSRF | cookie `SameSite=Lax`; Better Auth valida `Origin`; server actions de Next validan `Origin` vs `Host` | Better Auth / Next |
| Rate limiting / abuse | Turnstile + honeypot + dedupe 24 h en el endpoint público; regla de Vercel Firewall 20/min/IP en `/api/public/*` | route handler + Vercel |
| Webhook verification | `/api/inngest` verificado por el SDK con `INNGEST_SIGNING_KEY` | `serve()` de inngest |
| Dependency audit | `pnpm audit --prod` semanal; aprobación explícita de scripts de build (`allowBuilds`) | CI / pnpm |
| Security headers | CRM: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` (`next.config.ts`); sitio: los de `apps/web/vercel.json` + HSTS `max-age=63072000; includeSubDomains; preload` | configs del §19.6 |
| PII handling | datos de prospectos y contactos en Supabase `sa-east-1`; consentimiento con versión; retención 24 meses desde el último contacto (anonimización en R2); derechos ARCO vía info@tekinsof.com | `leads`, `contacts`, `/privacidad` |
| Logging hygiene | los logs JSON incluyen ids, nunca emails completos, teléfonos, tokens ni cuerpos de formularios | `graph.ts` (driver log), handlers |

**Hard rules**
- Ningún secreto se commitea, se imprime en un log ni llega al bundle del cliente. Todo `PUBLIC_*` es público.
- La autorización corre antes del trabajo, en el servidor, en cada petición.
- La API de datos de Supabase (PostgREST) no expone el esquema `public`: en Supabase → Settings → API
  se quita `public` de *Exposed schemas*; la app se conecta solo por Postgres con credenciales de servidor.
- `SUPABASE_SERVICE_ROLE_KEY` y los secretos de Graph solo existen en el proyecto `tekinsof-crm`.

**Régimen regulatorio:** Ley N.° 29733 de Protección de Datos Personales del Perú y su reglamento
(D.S. 016-2024-JUS): consentimiento previo, informado y expreso en cada formulario (casilla
obligatoria + versión guardada); política de privacidad publicada; atención de derechos ARCO;
inscripción del banco de datos personales de clientes/prospectos ante la Autoridad Nacional de
Protección de Datos Personales (lista de lanzamiento); transferencia internacional (Supabase en
Brasil, Vercel) declarada en la política. No hay datos de salud, menores ni pagos.

---

## 15. Accessibility

**Target: WCAG 2.2 Level AA.**

### Baseline requirements
| Requirement | Rule |
|---|---|
| Semantic HTML | Landmarks (`header`/`nav`/`main`/`footer`), un `h1` por página, encabezados en orden, listas para listas |
| Keyboard | Todo elemento interactivo alcanzable y operable por teclado; orden lógico; sin trampas; enlace "Saltar al contenido" en el CRM y en el sitio |
| Focus visible | Anillo de 2px `--focus` con offset 2px (regla global del paso 1) |
| Contrast | Texto 4.5:1, texto grande y bordes de UI 3:1 — la paleta del §7 lo cumple (ratios medidos allí) |
| Forms | Toda entrada con `<label>`; errores en texto con `role="alert"`/`aria-live`, nunca solo color |
| Images | Imágenes con significado con `alt`; decorativas (barras del motivo) con `alt=""` o `aria-hidden` |
| Motion | `prefers-reduced-motion: reduce` anula transiciones (regla global) |
| Zoom / reflow | Usable al 200% y a 320px sin scroll horizontal (la barra lateral del CRM pasa a `<details>`) |
| Live regions | Resultado de server actions y del formulario del sitio anunciado con `aria-live="polite"` |

### WCAG 2.2 additions — the ones most often missed
| SC | Requirement |
|---|---|
| 2.4.11 Focus Not Obscured (Min) | El banner de consentimiento y el botón flotante de WhatsApp nunca tapan por completo el elemento enfocado (el banner reserva espacio al pie) |
| 2.5.7 Dragging Movements | El kanban tiene botones "Mover a la etapa anterior/siguiente" (paso 13) |
| 2.5.8 Target Size (Min) | Objetivos de al menos 24×24px; botones del CRM de 36px de alto |
| 3.3.7 Redundant Entry | El formulario del sitio precarga el servicio de la página o landing |
| 3.3.8 Accessible Authentication (Min) | El login es el de Microsoft (gestores de contraseñas y passkeys permitidos); el CRM no tiene contraseñas propias |

### Verification
```bash
pnpm test:e2e   # incluye AxeBuilder en /leads, /configuracion/usuarios y el editor de cotizaciones — expect: 0 violaciones serious/critical
```
Antes del lanzamiento, a mano: recorrido solo con teclado de "registrar lead → convertir → cotizar",
una pasada con NVDA o VoiceOver sobre la bandeja de leads, y el sitio al 200% de zoom en 360px.

---

## 16. Observability & Cost

### Instrumentation
| Signal | Tool | What it captures | Who looks at it |
|---|---|---|---|
| Errors | Logs de Vercel (Runtime Logs) + alertas de errores de función de Vercel | excepciones no controladas con ruta y commit | Gerencia técnica / desarrollador |
| Logs | `console.info`/`console.error` con una línea JSON (`{ level, msg, requestId, actorId, leadId… }`) | eventos de dominio y fallos de integraciones, sin PII | desarrollador |
| Jobs | Historial de ejecuciones de Inngest | cada función, reintentos, fallos | desarrollador |
| Uptime | Better Stack (plan gratuito) | `GET https://crm.tekinsof.com/api/health` y `GET https://tekinsof.com/` cada 3 minutos | Gerencia (correo + WhatsApp) |

### The metrics that matter for this project

| Metric | Target | Alert at |
|---|---|---|
| Tasa de éxito del formulario (`POST /api/public/leads` 2xx sobre total) | ≥ 98% | < 90% en 30 min (también criterio de aborto del §9.1) |
| Leads con alerta de SLA en el mes | < 10% | > 25% en una semana |
| Funciones de Inngest fallidas tras reintentos | 0 | ≥ 1 en 24 h (alerta de Inngest por correo) |
| Filas de `outbox` pendientes con más de 10 minutos | 0 | > 0 durante 15 min |
| Uptime del CRM y del sitio | 99.5% mensual | caída de 2 chequeos seguidos |

### Health check
`GET /api/health` responde `{ status: "ok", service: "crm", commit }` (liveness). La comprobación de
base de datos vive en la ejecución de Inngest `outbox-flush` (cada minuto toca la base: si falla,
Inngest alerta). Una sonda profunda con `select 1` se agrega con Sentry en R2.

### Cost model
Precios a confirmar en las páginas de cada proveedor al contratar (no verificados en esta sesión).

| Service | Free tier | Cost at v1 scale (≤ 10 usuarios, ≤ 2 000 leads/mes) | Cost at 10× | Cliff to watch |
|---|---|---|---|---|
| Vercel | Hobby no permite uso comercial | Pro por miembro con acceso de despliegue (1–2 miembros) | igual + exceso de invocaciones/ancho de banda | crawlers sobre el CRM: proteger con la regla de Firewall |
| Supabase | Free pausa proyectos inactivos y no tiene backups diarios: no apto | Pro (incluye backups diarios) + un proyecto preview | igual (cómputo pequeño) | almacenamiento de PDFs > cuota incluida |
| Inngest | plan gratuito con cuota mensual de ejecuciones | `outbox-flush` cada minuto ≈ 43 200 ejecuciones/mes + crons ≈ 15 000 | igual (los crons no escalan con leads) | si la cuota gratuita no alcanza: `outbox-flush` cada 2 minutos o plan pago |
| Cloudflare Turnstile | gratis | 0 | 0 | — |
| Microsoft 365 / Graph | incluido en las licencias existentes | 0 | 0 | límites de envío de Exchange Online por buzón (miles/día) |
| Better Stack | gratis (pocos monitores) | 0 | 0 | — |

**Costo mensual estimado al lanzar:** Vercel Pro + Supabase Pro (dos proyectos) ≈ el rubro mayor;
la palanca más barata es usar un solo proyecto Supabase con *branching* para preview en vez de un
segundo proyecto. Ningún servicio escala de forma superlineal con el uso previsto.

---

## 17. Model Routing

NOT APPLICABLE — this project does not call an LLM at runtime.

---

## 18. Skills to Use During Build

Si una skill no está instalada, el constructor sigue con la guía de este blueprint y lo anota en una línea.

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `frontend-design` | 5, 6, 9, 10, 13, 15, 17, 18 | composición de pantallas del CRM y secciones del sitio con el sistema del §7 | `/plugin marketplace add anthropics/skills` luego `/plugin install example-skills@anthropic-agent-skills` |
| `ui-ux-pro-max` | 6, 10 | densidad de tablas, formularios y estados vacíos; verificar contraste de cualquier color nuevo | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` luego `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| `emil-design-eng` | 10, 13 | microinteracciones del hero y del arrastre del kanban dentro de los tiempos del §7 | `npx skills@latest add emilkowalski/skills` |
| `playwright-cli` | 1, 4, 5, 6, 8, 9, 15 | depurar las E2E y los escaneos de axe | `npm install -g @playwright/cli@latest` luego `playwright-cli install --skills` |
| `/claude-seo-ai:audit`, `/claude-seo-ai:geo` | 18 | auditoría SEO clásica y de motores de respuesta sobre `apps/web/dist` | `/plugin marketplace add Hainrixz/claude-seo-ai` luego `/plugin install claude-seo-ai@claude-seo-ai` y `/reload-plugins` |
| `/humanizalo` | 10, 18 | pulir los textos en español de la portada, servicios y landing demo (verificar antes: último push 2026-03-22) | `git clone https://github.com/Hainrixz/humanizalo.git ~/.claude/skills/humanizalo` |
| `pdf` | 16 | inspeccionar el PDF generado (texto extraíble, totales) | `/plugin marketplace add anthropics/skills` luego `/plugin install document-skills@anthropic-agent-skills` |

---

## 19. Agent Workspace

Modo bundle: todos los archivos de esta sección son **archivos reales** bajo
`blueprints/tekinsof-plataforma-comercial/workspace/`, que replica la raíz del proyecto. El Bootstrap
(§10) los copia con `rsync -a --ignore-existing` (o `cp -Rn … || true`): una segunda ejecución no
pisa nada. **Nunca se sobrescriben** después de la primera copia: `package.json` (los cuatro),
`pnpm-workspace.yaml` (pnpm puede agregarle `allowBuilds`), `pnpm-lock.yaml` y `.env`.

```
workspace/
├── CLAUDE.md · AGENTS.md                                  # §19.1 · §19.2
├── .claude/settings.json                                  # §19.3
├── .claude/skills/{schema-change,crm-page,task-gate}/SKILL.md   # §19.4
├── .claude/rules/{database,core-services,crm-ui,site}.md  # §19.5
├── package.json · pnpm-workspace.yaml · tsconfig.base.json · biome.json · .nvmrc · .gitignore · .env.example
├── .github/workflows/ci.yml
├── apps/crm/{package.json,next.config.ts,tsconfig.json,postcss.config.mjs,playwright.config.ts}
├── apps/crm/e2e/helpers/login.ts
├── apps/web/{package.json,astro.config.mjs,tsconfig.json,vercel.json}
├── apps/web/public/{robots.txt,llms.txt}
└── packages/core/{package.json,tsconfig.json,vitest.config.ts,drizzle.config.ts}
    packages/core/scripts/migrate.ts
```

### 19.1 `CLAUDE.md`

Emitido en `workspace/CLAUDE.md` (135 líneas): comandos primero, el camino de una petición y de un
lead por archivos reales, tabla de fronteras, fuentes únicas de verdad, 9 reglas de código, tokens
literales del §7, puntero a `.claude/rules/` y 6 reglas no negociables.

### 19.2 `AGENTS.md`

Emitido en `workspace/AGENTS.md`: descripción, tabla de comandos, las reglas no negociables y un
puntero a `CLAUDE.md` como fuente de verdad.

### 19.3 `.claude/settings.json`

Emitido en `workspace/.claude/settings.json`. `allow` contiene cada comando que aparece en un
`Verify` del §9 y en el §20.1 (los `pnpm …` exactos, `pnpm --filter @tekinsof/core test:*`,
`pnpm --filter @tekinsof/crm test:e2e:*`, los dos builds filtrados, `test:*`, `grep:*`) más los
`git` de checkpoint y de lectura. `deny`: leer `.env`/`.env.*`, `git push`, `rm -rf`, la CLI de
`vercel` y `supabase db reset`. Las reglas de denegación disuaden, no aíslan: los secretos reales
solo existen en Vercel.

### 19.4 Project skills — `.claude/skills/<name>/SKILL.md`

| Skill | Triggers on | What it automates |
|---|---|---|
| `schema-change` | "add a column", "new table", "migration" | editar `schema.ts` → `pnpm db:generate` → `pnpm db:migrate` ×2 → test |
| `crm-page` | "new page", "form to create", "add a button" | servicio de core + página server + server action con `authorize` + E2E con axe |
| `task-gate` | "is this step finished?", reanudar el build | correr el `verify` de la tarea, el gate fijo, commit y tag del checkpoint |

### 19.5 `.claude/rules/*.md`

| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/database.md` | `packages/core/src/db/**`, `packages/core/drizzle/**`, `packages/core/scripts/**` | casing, dinero, enums como check, borrado lógico, migraciones, bloqueo de PGlite |
| `.claude/rules/core-services.md` | `packages/core/src/**`, `packages/core/test/**` | firma de servicios, `Result`, `can()`, transacciones con auditoría/outbox, inyección de integraciones, tests |
| `.claude/rules/crm-ui.md` | `apps/crm/src/**`, `apps/crm/e2e/**` | autorización en páginas y acciones, `getEnv()`, tokens, estados, a11y, E2E |
| `.claude/rules/site.md` | `apps/web/**` | salida estática, una sola isla, SEO por página, consentimiento de píxeles, datos de contacto fijos |

### 19.6 Verify-critical config and local infrastructure

Todos emitidos como archivos reales bajo `workspace/`, en su ruta del proyecto. **No hay servicios
locales que levantar:** la base de los gates es PGlite (en memoria para Vitest, en `.data/` para
migrate/seed/E2E/build del sitio), así que no hay `docker-compose.yml`.

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| Manifiesto raíz | `package.json` | todos (scripts `typecheck`, `lint`, `build`, `test`, `test:e2e`, `db:*`) | `packageManager: pnpm@12.14.0`; scripts recursivos `pnpm -r --if-present` | `pnpm-workspace.yaml` solo incluye `apps/*` y `packages/*`: `blueprints/` nunca es un paquete |
| Workspace pnpm | `pnpm-workspace.yaml` | Bootstrap, paso 1 (`pnpm install`) | `allowBuilds` para `esbuild`, `protobufjs` (lo trae Inngest) y `sharp` — los scripts de build que pnpm 12 exigió aprobar al ejecutar el Bootstrap | globs limitados a `apps/*`, `packages/*` |
| TS base | `tsconfig.base.json` | `pnpm typecheck` (1–18) | `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` + `noEmit`; `module`/`moduleResolution` `nodenext` | n/a — extendido por cada paquete, cuyos `exclude` nombran `../../blueprints` |
| Biome | `biome.json` | `pnpm lint` (1–18) | `css.parser.tailwindDirectives: true`; `linter.rules.preset: "recommended"` (la clave `recommended` está deprecada en 2.5, y `biome migrate` la convierte en `"none"`, que apagaría todas las reglas: no usarlo); override para `**/*.astro` que apaga `noUnusedVariables`/`noUnusedImports` (Biome solo ve el frontmatter); `vcs.useIgnoreFile` | `"!!blueprints"` en `files.includes` — *force-ignore*: el escáner nunca entra en el bundle ni descubre su `biome.json` como segunda raíz (además excluye builds, `.data`, `drizzle`, `tsconfig.json`, `next-env.d.ts`, `*.svg`) |
| Node | `.nvmrc` | prerequisito, CI | `24` | n/a |
| Ignore | `.gitignore` | checkpoints, §20.1 | `!.env.example` después de `.env.*` | el bundle **sí** se commitea: no se ignora |
| Env | `.env.example` (→ `.env`) | 2, 4–18 vía las apps y scripts | valores locales offline (PGlite, `log`, `local`, Turnstile `1x…`) | n/a |
| CI | `.github/workflows/ci.yml` | §20.1 en CI | `cp .env.example .env` antes de los gates | n/a |
| Manifiesto core | `packages/core/package.json` | 2–18 (`test`, `db:generate`, `db:migrate`, `db:seed`) | `exports`: `./cms/blocks` → `./src/cms/blocks.tsx`, `./*` → `./src/*.ts`; `test` = `vitest run --passWithNoTests` | n/a — no camina el árbol |
| TS core | `packages/core/tsconfig.json` | `pnpm typecheck` | `jsx: react-jsx`, `types: ["node"]` | `"exclude": ["node_modules", "drizzle", "../../blueprints"]` |
| Vitest | `packages/core/vitest.config.ts` | 2, 3, 7, 8, 11–17 | resuelve `.ts` relativos nativamente; no lee env (los tests no lo necesitan) | `exclude: ["**/node_modules/**", "**/blueprints/**"]` |
| drizzle-kit | `packages/core/drizzle.config.ts` | 2 (`pnpm db:generate`) | `casing: "snake_case"`; `generate` no lee env | n/a — solo lee `src/db/schema.ts` |
| Migrador | `packages/core/scripts/migrate.ts` | 2, 18, `webServer` de Playwright | carga `<raíz>/.env` con `process.loadEnvFile`; `pglite://` relativo a la raíz; sale 0 si aún no hay migraciones | n/a |
| Manifiesto CRM | `apps/crm/package.json` | 1–18 (`build`, `typecheck` = `next typegen && tsc`, `test:e2e`) | dependencia `@tekinsof/core: workspace:*` | n/a |
| Next | `apps/crm/next.config.ts` | `pnpm --filter @tekinsof/crm build` (1, 4–17) | carga `../../.env`; `transpilePackages: ["@tekinsof/core"]` (core es TS fuente); `serverExternalPackages` para PGlite y react-pdf (WASM/binarios fuera del bundle) | n/a — Next solo compila `apps/crm` |
| TS CRM | `apps/crm/tsconfig.json` | `pnpm typecheck` | `module: esnext`, `moduleResolution: bundler`, alias `@/*`, `noUncheckedSideEffectImports: false` (import de CSS), `verbatimModuleSyntax: false` (tipos generados por Next) | `"exclude": ["node_modules", "../../blueprints"]` |
| PostCSS | `apps/crm/postcss.config.mjs` | build del CRM | `@tailwindcss/postcss` | n/a |
| Playwright | `apps/crm/playwright.config.ts` | 1, 4, 5, 6, 8, 9, 15, 16 | `webServer` = migrate + `next start -p 3000` con `env` literal (PGlite `.data/e2e`, `AUTH_TEST_MODE=1`, Turnstile `1x…`, `log`, `local`); borra `.data/e2e` solo en el proceso principal | `testIgnore: ["**/helpers/**", "**/blueprints/**"]` |
| Helper E2E | `apps/crm/e2e/helpers/login.ts` | 4, 5, 6, 9, 15, 16 | solo importa `@playwright/test` | n/a |
| Manifiesto web | `apps/web/package.json` | 1, 10, 18 (`build`, `typecheck` = `astro check`) | `@tekinsof/core: workspace:*` | n/a |
| Astro | `apps/web/astro.config.mjs` | `pnpm --filter @tekinsof/web build` (1, 10, 18) | carga `../../.env`; `vite.ssr.external` para PGlite y postgres; sitemap con filtro `!/lp/` | n/a — Astro solo compila `apps/web/src` |
| TS web | `apps/web/tsconfig.json` | `pnpm typecheck` (astro check) | extiende `astro/tsconfigs/strict`; `jsx: react-jsx`; `allowImportingTsExtensions` | `"exclude": ["dist", "node_modules", "../../blueprints"]` |
| Vercel (sitio) | `apps/web/vercel.json` | despliegue (lanzamiento) | `cleanUrls`, encabezados, redirecciones heredadas | n/a |
| SEO estático | `apps/web/public/robots.txt`, `apps/web/public/llms.txt` | 10, 18 (se copian a `dist/`) | — | n/a |

#### Resolution convention matrix

**La convención, una sola vez:** dentro de `packages/core`, los imports relativos llevan la extensión
real (`./schema.ts`, `../db/client.ts`, `./blocks.tsx`); entre paquetes se importa
`@tekinsof/core/<ruta-sin-extensión>` resuelto por `exports`; dentro de `apps/crm` se usa el alias
`@/` → `src/`; dentro de `apps/web`, imports relativos sin alias.

| Context | Command that exercises it | Convention as it appears there | Config + literal setting that makes it work |
|---|---|---|---|
| Código de core (typecheck) | `pnpm typecheck` | `import … from "./schema.ts"` | `tsconfig.base.json` — `"allowImportingTsExtensions": true`, `"rewriteRelativeImportExtensions": true`, `"noEmit": true` |
| Tests de core | `pnpm --filter @tekinsof/core test` | `import … from "../src/db/client.ts"` | Vitest (Vite) resuelve `.ts` explícitos sin configuración; `vitest.config.ts` no necesita alias |
| Scripts sueltos | `pnpm db:migrate` (= `node scripts/migrate.ts`), `pnpm db:seed` | `import … from "../src/db/client.ts"` (seed) | Node 24 quita tipos y resuelve el especificador **literal**, por eso `.ts` explícito; `"erasableSyntaxOnly": true` en `tsconfig.base.json` impide sintaxis que Node no puede quitar |
| CRM (Next/Turbopack) | `pnpm --filter @tekinsof/crm build` | `@tekinsof/core/leads/leads` y dentro de core `./x.ts` | `apps/crm/next.config.ts` — `transpilePackages: ["@tekinsof/core"]`; `packages/core/package.json` — `"exports": { "./*": "./src/*.ts" }`; `apps/crm/tsconfig.json` — `"moduleResolution": "bundler"`, `"paths": { "@/*": ["./src/*"] }` |
| CRM E2E (Playwright) | `pnpm --filter @tekinsof/crm test:e2e` | `../src/lib/env` y `./helpers/login` | cargador TypeScript de Playwright (resuelve sin extensión); `env.ts` solo importa `zod` |
| Sitio (Astro/Vite) | `pnpm --filter @tekinsof/web build` | `@tekinsof/core/cms/blocks`, `@tekinsof/core/db/client` | `exports` de core (`./cms/blocks` → `./src/cms/blocks.tsx`); Vite procesa paquetes enlazados del workspace; `astro.config.mjs` — `vite.ssr.external: ["@electric-sql/pglite", "postgres"]` |
| drizzle-kit | `pnpm db:generate` | `schema.ts` sin imports internos | `drizzle.config.ts` — `schema: "./src/db/schema.ts"` |

#### Cross-artifact value reconciliation

| Shared value | Single source — the file that decides it | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Puerto del CRM | `apps/crm/package.json` — scripts `dev`/`start` | `3000` | `playwright.config.ts` (`next start -p 3000`, `baseURL`, `url` del webServer, `BETTER_AUTH_URL`, `CRM_BASE_URL`) · `.env.example` (`BETTER_AUTH_URL`, `CRM_BASE_URL`, `PUBLIC_LEADS_API_URL`) · §10 | yes |
| Puerto del sitio | `apps/web/package.json` — `dev`/`preview` | `4321` | `.env.example` `SITE_ORIGIN` · `playwright.config.ts` `SITE_ORIGIN` · E2E `public-leads.spec.ts`/`leads.spec.ts` (`Origin: http://localhost:4321`) · §10 | yes |
| Ruta de salud | `apps/crm/src/app/api/health/route.ts` (paso 1) | `/api/health` | `playwright.config.ts` `webServer.url` · `e2e/health.spec.ts` · §5 · §16 | yes |
| Endpoint público | `apps/crm/src/app/api/public/leads/route.ts` (paso 8) | `/api/public/leads` | `.env.example` `PUBLIC_LEADS_API_URL` · §5 · paso 9 E2E · §12 | yes |
| Nombres de paquete | `packages/core/package.json`, `apps/crm/package.json`, `apps/web/package.json` — `name` | `@tekinsof/core`, `@tekinsof/crm`, `@tekinsof/web` | `package.json` raíz (filtros) · cada `Verify` con `--filter` · `settings.json` · CLAUDE.md · `next.config.ts` `transpilePackages` | yes |
| Directorio de migraciones | `packages/core/drizzle.config.ts` — `out` | `./drizzle` (`packages/core/drizzle`) | `scripts/migrate.ts` (`join(coreDir, "drizzle")`) · `src/db/client.ts` (`migrationsFolder`) · `biome.json` (`!**/drizzle`) · `tsconfig` de core (`exclude`) · paso 2 Verify | yes |
| Esquema | `drizzle.config.ts` — `schema` | `./src/db/schema.ts` | `client.ts` (`import * as schema from "./schema.ts"`) · paso 2 · §4 | yes |
| Directorio PGlite local | `.env.example` — `DATABASE_URL` | `pglite://.data/dev` | `migrate.ts`/`client.ts` (relativo a la raíz) · `.gitignore` (`.data/`) · `biome.json` (`!**/.data`) | yes |
| Directorio PGlite E2E | `apps/crm/playwright.config.ts` | `../../.data/e2e` (= `<raíz>/.data/e2e`) | `webServer.env.DATABASE_URL` en el mismo archivo · `.gitignore` | yes |
| Salida del sitio | `apps/web/astro.config.mjs` (default `dist`, `build.format: "file"`) | `apps/web/dist/<ruta>.html`, `dist/sitemap-0.xml` | Verify de los pasos 1, 10, 18 · `.gitignore` (`dist/`) · §12 (`dist`) | yes |
| Ruta del bundle | este documento | `blueprints/tekinsof-plataforma-comercial/` | Bootstrap `BUNDLE=` · `biome.json` `!!blueprints` · los tres `tsconfig.json` `../../blueprints` · `vitest.config.ts`, `playwright.config.ts` `**/blueprints/**` · CLAUDE.md · AGENTS.md · skill `task-gate` | yes |
| Dominio de prueba E2E | `apps/crm/e2e/helpers/login.ts` | `@e2e.tekinsof.test` | `playwright.config.ts` `CRM_BOOTSTRAP_ADMIN_EMAIL` (`gerencia@e2e.tekinsof.test`) · paso 3 `admitUser` · paso 12 `entraSync` · §8 | yes |
| Clave de prueba Turnstile | `.env.example` | secreto `1x0000000000000000000000000000000AA`, site key `1x00000000000000000000AA` | `playwright.config.ts` · paso 4 `env.ts` default · paso 8 emulación · §5 | yes |
| Versión de pnpm | `package.json` raíz — `packageManager` | `pnpm@12.14.0` | Bootstrap (`pnpm -v` = `12.14.0`) · §10 · §11 | yes |

#### Byte-exact artifact reconciliation

| Byte-exact artifact | Authored by | First diffed at | Blueprint rules that constrain it | Runtime call that produces it, on the §11 pin | Both confirmed |
|---|---|---|---|---|---|
| Vectores de `addBusinessHours` (tabla del paso 12) | paso 12 | paso 12 (`business-hours.test.ts`) | §1/§8: L–V 09:00–18:00 Lima, feriados excluidos, 4 horas; Lima = UTC−5 fijo; salida ISO UTC | `node check.ts` sobre el `business-hours.ts` literal en Node 24.22.1 durante la generación: los 7 resultados coinciden con la tabla | yes |
| Vectores de `computeQuoteTotals`, `lineTotalCents`, `formatAmount` (tabla del paso 14) | paso 14 | paso 14 (`quote-math.test.ts`) | §4: céntimos enteros; IGV 18%; descuento sobre subtotal antes de IGV; redondeo half-up; formato `1,234.56` | `node check.ts` sobre el `quote-math.ts` literal en Node 24.22.1: `{100000,0,18000,118000}`, `{199998,20000,32400,212398}`, `167`, `false/true`, `"1,234,567.89"`, `"0.05"`, rechazo de 3 decimales; la fila del 15% (`{100000,15000,15300,100300}`) se deriva con la misma fórmula: 15% de 100000 = 15000, 18% de 85000 = 15300 | yes |
| Totales visibles del E2E de cotización (`1,000.00` / `153.00` / `1,003.00`) | paso 15 | paso 15 (`quotes.spec.ts`) | los mismos que la fila del 15% + `formatAmount` | `formatAmount(100000)` = `"1,000.00"`, `formatAmount(15300)` = `"153.00"`, `formatAmount(100300)` = `"1,003.00"` (misma función verificada) | yes |

Ningún gate compara mensajes producidos por el runtime (errores de parser, trazas): los tests
afirman códigos de `Result`, estados HTTP y claves de `fields`.

---

## 20. Acceptance Gate, Risks & Decision Log

### 20.1 Global acceptance gate

El proyecto está **terminado** cuando todo lo siguiente sale con 0 en un checkout limpio (con `.env`
copiado de `.env.example`), y no antes. Es el mismo conjunto que corre CI.

```bash
pnpm install --frozen-lockfile        # expect: exit 0
pnpm typecheck                        # expect: exit 0, zero errors
pnpm lint                             # expect: exit 0, zero errors and zero warnings
pnpm test                             # expect: exit 0, 0 failed, 0 skipped
pnpm db:migrate                       # expect: exit 0
pnpm db:seed                          # expect: exit 0
pnpm build                            # expect: exit 0 (crm + web)
pnpm test:e2e                         # expect: exit 0, 0 failed — runs `next start` and requests /api/health first
grep -q "Tekinsof Consulting" apps/web/dist/index.html          # expect: exit 0 — the built site is the one served
test -f apps/web/dist/servicios/desarrollo-de-software.html     # expect: exit 0
pnpm db:generate                      # expect: exit 0
test -z "$(git status --porcelain -- packages/core/drizzle)"    # expect: exit 0 — schema.ts and committed migrations agree
```

**Lista de lanzamiento (manual, una vez antes de lanzar):**

- [ ] Cada paso del §9 tiene su tag: `git tag -l 'step-*'` lista uno por paso, de `step-01-scaffold` a `step-18-site-dynamic`.
- [ ] Archivos commiteados presentes en un checkout limpio, uno por invocación: `git ls-files --error-unmatch .env.example`, `git ls-files --error-unmatch pnpm-lock.yaml`, `git ls-files --error-unmatch packages/core/drizzle/meta/_journal.json`, `git ls-files --error-unmatch .claude/settings.json`, `git ls-files --error-unmatch .github/workflows/ci.yml` — cada uno sale 0; y por cada ruta `status=0; git check-ignore -q <ruta> || status=$?; test "$status" -eq 1`.
- [ ] El `.gitignore` estaba antes del primer commit: `test "$(git log --diff-filter=A --format=%H -- .gitignore | tail -n 1)" = "$(git rev-list --max-parents=0 HEAD)"` sale 0.
- [ ] Cada fila de *Byte-exact artifact reconciliation* (§19.6) dice `Both confirmed: yes`.
- [ ] El Bootstrap (§10) se volvió a correr sobre el árbol ya construido, **salió con 0**, y `pnpm typecheck` siguió pasando (el manifiesto no se revirtió).
- [ ] Cada fila de *Cross-artifact value reconciliation* dice `Compared: yes`, y lint/format/typecheck se corrieron desde la raíz **con el bundle presente**.
- [ ] §9.1: filas 1–5 de paridad probadas contra `nuevo.tekinsof.com` y luego contra `tekinsof.com`; reversión de DNS ensayada una vez; el sitio de GoDaddy sigue disponible 30 días.
- [ ] Ningún non-goal del §1 fue construido.
- [ ] Todas las variables del §10 marcadas "prod" están en Vercel (proyecto correcto) y ausentes del repo; `VERCEL_ENV=production` arranca sin error de `env.ts`.
- [ ] Viaje real de un lead: formulario en `https://tekinsof.com` con Turnstile real → 201 → aparece en el CRM → Inngest asigna → el vendedor recibe el correo desde `notificaciones@` y el prospecto el acuse desde el buzón del vendedor.
- [ ] Graph: la *RBAC for Applications* de Exchange limita la App 2 al grupo de buzones comerciales (un envío "desde" un buzón fuera del grupo falla con 403).
- [ ] Login real con Microsoft para el email de bootstrap; un usuario del tenant sin invitación ve "no tiene acceso"; deshabilitar una cuenta en Entra la desactiva tras `entra-sync`.
- [ ] Cotización real enviada a un buzón externo con el PDF adjunto; `company_profile.ruc` completado en `app_settings`.
- [ ] Publicar una landing en el CRM dispara el deploy hook y la landing aparece en `https://tekinsof.com/lp/<slug>` en ≤ 5 minutos.
- [ ] Supabase: `public` fuera de *Exposed schemas*; backups diarios activos; una restauración probada en el proyecto preview.
- [ ] Vercel Firewall: regla de 20/min/IP en `/api/public/*`; región de funciones `gru1`.
- [ ] Feriados 2026–2027 de la tabla del paso 18 comparados con el calendario oficial (gob.pe) y corregidos en `/configuracion` o por SQL si hiciera falta.
- [ ] Política de privacidad revisada por el asesor legal del cliente; banco de datos personales inscrito ante la Autoridad Nacional de Protección de Datos Personales.
- [ ] Contenido real: textos de la portada, resúmenes del catálogo y certificaciones/casos reales provistos por Tekinsof (sin afirmaciones inventadas).
- [ ] Lighthouse móvil ≥ 95 en Performance y SEO en `/` y en una landing.
- [ ] Recorrido solo con teclado y una pasada con lector de pantalla sobre la bandeja de leads (§15).
- [ ] Un rollback de Vercel ejecutado a propósito en preview (§12).
- [ ] Monitores de Better Stack activos; alerta de fallos de Inngest configurada.
- [ ] Certificado TLS del sitio anterior renovado mientras dure la transición (hallazgo del 2026-10-27).

**Ninguna advertencia se ignora.**

### 20.2 Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| Los pasos 3–18 no se ejecutaron al generar el blueprint (sí el Bootstrap ×2, los pasos 1–2, el CRM con `next start` y la capa de datos): una API de Better Auth, Inngest o react-pdf puede diferir de lo descrito | M | M | un `Verify` de los pasos 3–18 falla por una firma o una opción | el constructor ajusta el código (nunca el `Verify`) siguiendo la documentación de la versión fijada en §11; los contratos dudosos (esquema de Better Auth, API v4 de Inngest) se verificaron contra el paquete publicado. Dueño: desarrollador |
| Los vendedores siguen atendiendo por la app de WhatsApp y no registran el lead en el CRM | A | A | leads `whatsapp` ≪ conversaciones reales; Gerencia sin datos | alta rápida móvil de 3 campos (paso 9); revisión semanal de Gerencia; la Cloud API (R2/R3) elimina el paso manual. Dueño: Gerencia |
| `Mail.Send` como permiso de aplicación permite enviar desde cualquier buzón del tenant si no se acota | M | A | prueba de envío desde un buzón fuera del grupo funciona | *RBAC for Applications* de Exchange antes de cargar el secreto en producción (lista de lanzamiento). Dueño: administrador M365 |
| Cuota del plan gratuito de Inngest superada por `outbox-flush` cada minuto | M | B | aviso de uso de Inngest | bajar a cada 2 minutos (los avisos siguen en < 3 min) o plan pago. Dueño: desarrollador |
| PGlite como base de dev/E2E difiere de Supabase en algún comportamiento (extensiones, locks) | B | M | un test verde localmente falla en preview | todo el SQL es Postgres estándar sin extensiones; CI corre migraciones contra PGlite y el deploy de preview contra Supabase preview; ante una diferencia, se agrega un test contra Supabase preview. Dueño: desarrollador |
| Alcance: 18 pasos densos para un equipo pequeño | M | A | más de 2 sesiones por paso en el Epic 1 | la captación (pasos 8–12) entrega valor antes de cotizaciones; los Non-Goals están cerrados; R2 recibe su propio blueprint |
| Contenido del sitio (textos, casos, certificaciones) no llega a tiempo | A | M | portada con textos provisionales a la semana del lanzamiento | el sitio lanza con servicios y formulario; casos de éxito y blog son R2; checklist de contenido en §20.1 |
| Cambio de DNS rompe el correo de M365 | B | A | MX distinto tras el cambio | solo se editan `A @` y `CNAME www`; captura de la zona antes; criterio de aborto del §9.1 |

### 20.3 Decision log

| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | TypeScript/Node, monorepo pnpm | .NET (afinidad con Microsoft) | un lenguaje para sitio, CRM y dominio; ecosistema más rápido para este producto; el equipo no tiene restricción | Tekinsof contrata un equipo .NET que mantendrá la plataforma |
| 2 | CRM propio | HubSpot/Zoho | decisión del cliente: control total de datos, sin costo por usuario, proceso a medida | el mantenimiento propio supera el costo de licencias de 10 usuarios |
| 3 | Astro estático para el sitio, Next.js para el CRM | una sola app Next para ambos | rendimiento y SEO del sitio sin hidratación; despliegues y ritmos separados | el sitio necesita contenido personalizado por visitante |
| 4 | Supabase (Postgres + Storage) en `sa-east-1`, Auth apagado | Neon + almacenamiento aparte | un proveedor para datos y archivos, la región más cercana a Lima, backups incluidos | latencias desde Lima > 150 ms sostenidas o costo de Storage |
| 5 | PGlite para dev, tests y E2E | Postgres en Docker | gates sin Docker ni red; Postgres real en proceso | aparece una diferencia de comportamiento que un test no puede evitar |
| 6 | Better Auth + Entra ID por invitación | Clerk / Supabase Auth | usuarios en nuestra base, SSO de M365 sin costo por usuario, invitación controlada | se abre el portal de clientes con miles de cuentas externas (evaluar Clerk para ese portal) |
| 7 | Permisos en código (rol → permisos) | permisos como filas | 4 roles fijos de un solo cliente interno | Tekinsof necesita roles a medida |
| 8 | Inngest + outbox transaccional | Vercel Cron solo | reintentos, historial y debounce; ningún evento se pierde si Inngest falla | costos de Inngest o un host con cron/colas propias |
| 9 | Microsoft Graph para todo correo | Resend/SendGrid | el correo sale del Outlook del vendedor y las respuestas le llegan a él | campañas masivas (R3) — ahí sí un proveedor de email marketing |
| 10 | Lima como UTC−5 fijo, sin librería de zonas | date-fns-tz | Perú no tiene horario de verano desde 1994; un solo cálculo, probado | Perú adopta horario de verano |
| 11 | Esquema completo de R1 en el paso 2 | una migración por feature | los pasos no compiten por `schema.ts`; el gate de datos prueba todo el modelo de una vez | R2 agrega tablas: sigue el skill `schema-change` |
| 12 | Sin Sentry en R1 | Sentry desde el día uno | presupuesto de 18 pasos; logs de Vercel + Inngest + uptime cubren el arranque | primer incidente sin diagnóstico suficiente, o inicio de R2 (lo que ocurra antes) |
| 13 | Componentes con HTML nativo + `ui.tsx` | shadcn/Radix | presupuesto de archivos por paso; accesibilidad nativa suficiente para tablas y formularios | aparecen menús, combobox o diálogos complejos en R2 |
| 14 | Release 1 sin dashboard, ventas/cobranza, blog ni casos | todo en un blueprint | el formato admite 10–18 pasos de una sesión; el orden sigue las prioridades del propio cliente | — (R2 es el siguiente blueprint) |

### 20.4 What to build next

1. **Release 2 — Ventas, cobranza y dashboard** (prioridades 9–10): ventas desde cotizaciones
   aceptadas, cronograma de cuotas, pagos, cuentas por cobrar por antigüedad, número de factura
   manual, dashboard gerencial consolidado en PEN con el tipo de cambio de cada documento,
   importación CSV de empresas/contactos desde Excel, Sentry. *Trigger:* §20.1 en verde.
2. **Release 2 — Contenido** (prioridades 11–12): blog con editor de texto enriquecido y casos de
   éxito administrables, con logos de clientes y JSON-LD `Article`. *Trigger:* §20.1 en verde y
   contenido real disponible.
3. **WhatsApp Business Cloud API:** número dedicado, leads automáticos, historial de conversaciones
   en `conversaciones`/`mensajes`, plantillas aprobadas. *Trigger:* Tekinsof verifica el negocio en Meta.
4. **Facturación electrónica SUNAT** vía OSE/PSE. *Trigger:* decisión de proveedor.
5. **Portal de clientes y firma electrónica de cotizaciones.** *Trigger:* primer cliente que lo pida.

---

*End of blueprint. Build order is §9. Stop when §20.1 is green.*
