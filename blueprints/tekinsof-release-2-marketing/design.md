# Plataforma Comercial Tekinsof — Release 2: Marketing Automation y Captación — Diseño

> Estado: **propuesta para decisión**, no un blueprint ejecutable. Antes de construir, cada fase se
> convierte en pasos con `Verify` en un blueprint propio (como el de la Release 1).
> Fecha: 2026-10-29. Base: `blueprints/tekinsof-plataforma-comercial/blueprint.md` (Release 1).

---

## 0. Decisiones que este diseño necesita antes de construir

La Release 1 declaró varias de estas piezas como **Non-Goals** (§1 del blueprint). Este documento
las propone; construirlas exige que Tekinsof las apruebe de forma explícita y que el blueprint de
la Release 2 actualice esa tabla. Hasta entonces, nada de esto se implementa.

| Pieza pedida | Estado en la Release 1 | Disparador que la R1 fijó | Decisión requerida |
|---|---|---|---|
| Multi-tenant | "Excluido por el cliente — nunca sin rediseño" | — | Aprobar el rediseño "tenant-ready" del §3 |
| WhatsApp Business API | Non-Goal | Tekinsof aprueba migrar un número y verificar el negocio en Meta | Elegir número (ver §5.4) y verificar el negocio |
| Bot IA comercial | Non-Goal ("IA aplicada a ventas") | Un caso de uso concreto | Aprobar el caso de uso del §6 y su política de datos |
| Dashboard de marketing | Planificado para R2 | R1 en verde + 4 semanas de leads reales | Ninguna; respetar el disparador |
| Ventas, cuotas y cobranza; CSV; blog | Planificados para "R2" | Inicio de la R2 | **Ordenar**: ¿esta release de marketing va antes o después de ventas/cobranza? |

**Prerrequisito duro:** la Release 1 completa en producción, incluido el CRM en `crm.tekinsof.com`
(hoy solo está publicado el sitio). Sin el CRM no hay dónde aterrizar un solo lead de anuncios.

---

## 1. Alcance

### Objetivos

1. Todo lead pagado (Meta, TikTok, Google) entra solo al CRM en menos de 1 minuto, con campaña,
   anuncio y formulario de origen, sin exportar CSV.
2. WhatsApp deja de vivir en un celular: bandeja compartida en el CRM, leads automáticos,
   plantillas aprobadas y respuesta dentro de la ventana de 24 horas.
3. Marketing crea formularios y los inserta en landings y en el sitio sin desarrollador.
4. Un bot comercial responde fuera de horario y en el primer minuto, califica y **entrega a un
   humano**; nunca cierra ventas ni da precios fuera del catálogo.
5. Cada lead recibe una calificación A–D explicable; los A se asignan y notifican de inmediato.
6. Marketing ve costo por lead, conversión por canal y el embudo completo hasta la venta ganada.
7. El modelo de datos admite una segunda empresa sin migración de datos destructiva.

### Fuera de esta release

| No se construye | Por qué |
|---|---|
| Secuencias de nurturing por email y campañas masivas | Siguen en la Release 3 de marketing |
| Editor visual libre de páginas | El constructor de formularios es por campos con los tokens de diseño; las landings siguen por bloques |
| Onboarding self-service de otras empresas, facturación SaaS, dominios por cliente | Fase posterior (§9, F8); aquí solo se deja el modelo listo |
| Gestión de anuncios (crear/pausar campañas en Meta/Google/TikTok) | Solo se **leen** leads y gasto; los anuncios se operan en cada plataforma |
| Bot con voz, o bot que envía campañas proactivas | Solo responde conversaciones iniciadas por el prospecto |

---

## 2. Arquitectura general

```
 Meta Lead Ads ─┐                                   ┌─> leads ──> scoring ──> asignación + alertas
 TikTok Leads ──┤   /api/webhooks/<proveedor>        │
 Google Forms ──┼─> verificar firma ─> inbound_events ┼─> outbox ─> Inngest ──┤
 WhatsApp API ──┤   (200 inmediato, sin lógica)      │                        ├─> bot IA (Claude) ─> respuesta / handoff
 Formularios ───┘   /api/public/forms/:id/submit     └─> conversations/messages
                                                         campaign_spend_daily <── cron de gasto
                                                         vistas de dashboard  <── cron de refresco
```

Reglas que heredan de la R1 y se mantienen:

- **Los webhooks no procesan.** Verifican la firma, guardan el cuerpo crudo en `inbound_events`
  (idempotente por id externo) más una fila de `outbox` en la misma transacción, y responden 200.
  Todo lo demás corre en funciones Inngest con reintentos. Así un error nuestro nunca hace que
  Meta o Google desactiven el webhook por fallas repetidas.
- **Integraciones inyectadas por `deps`** (como Graph y Turnstile en R1): los tests usan fakes y
  nunca la red.
- **Servicios de core con zod + `Result`**, autorización con `can()`, auditoría en la misma
  transacción.

---

## 3. Multi-tenant: "tenant-ready" sin pagar el costo de un SaaS hoy

### Recomendación

Una sola base, **columna `organization_id` en toda tabla de negocio**, con aislamiento aplicado en
dos capas. Se introduce al inicio de la R2 con una sola organización (Tekinsof) y se rellena en
la misma migración. Se descartan:

- *Base o esquema por cliente*: multiplica migraciones, backups y conexiones; no se justifica
  hasta decenas de clientes con exigencias de aislamiento físico.
- *Esperar a tener el segundo cliente*: agregar `organization_id` a 30 tablas con datos y código
  ya escrito es la migración más cara y riesgosa que existe en un CRM.

### Capas de aislamiento

1. **Aplicación (desde el día 1):** el `Actor` gana `organizationId`. Todo servicio de core filtra
   por `actor.organizationId`; los repositorios reciben el id y no existe una consulta de negocio
   sin él. Un test de arquitectura recorre `schema.ts` y falla si una tabla de negocio no tiene
   la columna.
2. **Base de datos (antes del segundo cliente):** Postgres RLS con
   `set_config('app.org_id', …, true)` al abrir cada transacción y políticas
   `organization_id = current_setting('app.org_id')::uuid`. Es la red de seguridad si un servicio
   olvida el filtro. Se activa en F8 porque exige un rol de base sin `BYPASSRLS` y probar cada
   consulta.

### Cambios de modelo

| Tabla | Cambio |
|---|---|
| `organizations` (nueva) | `id`, `name`, `slug` unique, `legal_name`, `ruc`, `timezone` (default `America/Lima`), `locale`, `plan`, `status` (`activa`, `suspendida`), `settings jsonb` |
| `memberships` (nueva) | `organization_id`, `user_id`, `role` (los 4 roles de R1 + `admin_marketing`), `is_active`, `receives_leads`, `last_assigned_at`; único (org, user). **`users.role`, `receives_leads` y `last_assigned_at` se mudan aquí** |
| Todas las tablas de negocio de R1 | `organization_id uuid not null` FK `organizations` (restrict) + índice compuesto que empieza por él; los únicos (`campaigns.slug`, `services.code`, `quotes.number`…) pasan a ser únicos **por organización** |
| `holidays`, `app_settings`, `quote_sequences` | Por organización (feriados y horario laboral dependen del país del cliente) |

### Identidad

- Better Auth sigue siendo dueño de la sesión; su plugin de organizaciones cubre membresías y
  organización activa.
- Hoy el login es Entra ID restringido al tenant de Tekinsof. Para otra empresa: app de Entra
  multi-tenant con lista de tenants permitidos por organización, o correo con código (OTP).
  Se decide en F8; la R2 solo deja `memberships` listo.

### Credenciales por organización

`integration_accounts` guarda los tokens de Meta, TikTok, Google y WhatsApp **por organización**,
cifrados en la aplicación (AES-256-GCM, clave en `INTEGRATIONS_ENCRYPTION_KEY`, rotación con
`key_version`). Nunca en texto plano en la base ni en logs.

---

## 4. Modelo de datos

Convenciones de la R1 sin cambios: uuid, `created_at`/`updated_at`, enums como `text` + `check`,
céntimos enteros, `timestamptz`, borrado lógico en entidades comerciales. Todas las tablas nuevas
llevan `organization_id`.

### 4.1 Captación

**integration_accounts** — `provider` ∈ meta, tiktok, google_ads, whatsapp; `external_account_id`
(página, anunciante, cliente de Google Ads o `phone_number_id`); `display_name`; `status` ∈
conectada, expirada, revocada, error; `credentials_encrypted bytea`, `key_version`;
`token_expires_at`; `webhook_secret_encrypted`; `connected_by`; `last_ok_at`, `last_error`.
Único (organization_id, provider, external_account_id).

**inbound_events** — registro crudo e idempotente de todo webhook. `provider`, `event_type`,
`external_id` (leadgen_id, lead_id, wamid…), `payload jsonb`, `signature_valid`, `status` ∈
recibido, procesado, ignorado, error; `attempts`, `error`, `received_at`, `processed_at`.
Único (provider, external_id). Retención: 90 días (cron de purga), por datos personales.

**ad_forms** — formularios de anuncios conocidos. `provider`, `external_form_id`, `name`,
`campaign_id` (FK, set null), `field_mapping jsonb` (campo del proveedor → campo del lead),
`consent_text` (copiado del formulario del anuncio), `is_active`. Se crean solos al primer lead
de un formulario desconocido, con estado "sin mapear" para que Marketing lo revise.

**leads** (cambios):

| Campo | Cambio |
|---|---|
| `source` | el `check` suma `meta_lead_ads`, `tiktok_lead_ads`, `google_lead_form`, `whatsapp_api`, `chatbot`, `form` |
| `external_lead_id`, `ad_form_id`, `ad_id`, `adset_id` | nuevos; único (organization_id, source, external_lead_id) para no duplicar reintentos |
| `ttclid` | nuevo (TikTok); `gclid` y `fbclid` ya existen |
| `score`, `grade`, `scored_at` | nuevos, desnormalizados de `lead_scores` para filtrar la bandeja |
| `raw_answers jsonb` | respuestas de preguntas personalizadas que no mapean a un campo |

### 4.2 Formularios

**forms** — `name`, `slug`, `status` ∈ borrador, publicado, archivado; `campaign_id`;
`current_version`; `success_message`, `redirect_url`; `notify_user_ids`.

**form_versions** — inmutables al publicarse. `form_id`, `version`, `fields jsonb` (validado por
zod: `text`, `email`, `phone`, `select`, `multiselect`, `textarea`, `checkbox`, `hidden`; cada uno
con `key`, `label`, `required`, `maps_to` → campo del lead u `answers`), `consent_text`,
`published_at`, `published_by`.

**form_submissions** — `form_id`, `version`, `data jsonb`, `lead_id`, `consent_at`,
`ip_hash` (sha-256 con sal, no la IP), `user_agent`, `utm_*`, `landing_slug`.

Las landings de R1 ganan un bloque `form` que referencia `forms.slug`; el sitio lo renderiza en el
build y el envío va a `POST /api/public/forms/:slug/submit` (mismo CORS + Turnstile de R1).

### 4.3 Conversaciones y WhatsApp

`conversations` y `messages` ya existen en R1 como anclas. Se completan:

**conversations** (+): `integration_account_id`; `status` ∈ bot, humano, en_espera, cerrada;
`assigned_to` (FK users); `bot_enabled`; `customer_window_expires_at` (último mensaje entrante +
24 h); `last_inbound_at`, `last_outbound_at`; `handoff_reason`; `unread_count`.

**messages** (+): `type` ∈ text, template, image, document, audio, interactive, system;
`template_id`; `author` ∈ prospecto, usuario, bot, sistema; `pricing_category` (lo que Meta cobra,
para conciliar costos); `status` ∈ en_cola, enviado, entregado, leido, fallido; `error`.

**whatsapp_templates** — `name`, `language` (`es`/`es_PE`), `category` ∈ marketing, utility,
authentication; `status` (espejo de Meta); `components jsonb`; `variables jsonb`; `synced_at`.

### 4.4 Bot IA

**bot_configs** — una por organización y canal. `is_enabled`; `mode` ∈ siempre, fuera_de_horario,
apagado; `persona_prompt` (texto que Marketing edita: tono, nombre del asistente);
`handoff_rules jsonb`; `max_bot_turns` (default 8); `model`; `effort`; `version`.

**kb_articles** — base de conocimiento para el bot: `title`, `body`, `service_id`,
`is_published`. Junto con `services` es lo único que el bot puede citar.

**bot_runs** — una fila por respuesta del bot: `conversation_id`, `message_id`,
`config_version`, `model`, `input_tokens`, `cached_input_tokens`, `output_tokens`, `cost_micro_usd`,
`stop_reason`, `tool_calls jsonb`, `latency_ms`, `outcome` ∈ respondio, handoff, error, rechazo.
Sirve para auditar, medir costo real y construir el set de evaluación.

### 4.5 Calificación

**scoring_models** — versiones de las reglas: `version`, `rules jsonb` (peso por señal),
`thresholds jsonb` (A ≥ 75, B ≥ 50, C ≥ 25), `is_active`, `created_by`.

**lead_scores** — historial: `lead_id`, `scoring_model_version`, `rule_score` 0–100,
`ai_signals jsonb` (necesidad, presupuesto, plazo, rol de decisión, tamaño, cada uno con evidencia
textual), `ai_score` 0–100, `final_score`, `grade` ∈ A, B, C, D, `reasons jsonb`, `scored_at`.

### 4.6 Campañas, gasto y embudo

**campaigns** (+): `objective` ∈ leads, trafico, marca; `external_refs jsonb` (ids de campaña
en cada plataforma), `utm_campaign` (por defecto = `slug`), `target_cpl_cents`.

**campaign_spend_daily** — `campaign_id`, `provider`, `date`, `spend_cents`, `currency`,
`impressions`, `clicks`, `platform_leads`; único (campaign_id, provider, date). La llena un cron
diario desde las APIs de reportes; un ajuste manual queda auditado.

**lead_stage_events** — `lead_id`, `opportunity_id`, `from_stage`, `to_stage`, `occurred_at`,
`actor_id`. Se escribe en la misma transacción que cada cambio de estado del lead o de etapa de
la oportunidad. Permite medir tiempos entre etapas sin reconstruir `audit_events`.

**Vistas materializadas** (refresco cada 15 min por Inngest): `mv_leads_daily` (org, día, source,
campaign, grade, count), `mv_funnel_daily` (conteos por etapa), `mv_campaign_performance`
(gasto, leads, CPL, oportunidades, ganadas, monto ganado en PEN, ROAS).

### 4.7 Relaciones nuevas (resumen)

- organizations —(1:N)→ toda tabla de negocio — **restrict**.
- integration_accounts —(1:N)→ conversations, ad_forms — **set null** (desconectar no borra historia).
- forms —(1:N)→ form_versions **cascade**, form_submissions **restrict**.
- leads —(1:N)→ lead_scores, lead_stage_events — **cascade**.
- conversations —(1:N)→ bot_runs — **cascade**.
- campaigns —(1:N)→ campaign_spend_daily — **cascade**; ad_forms, forms — **set null**.

---

## 5. Integraciones

### 5.1 Facebook / Instagram Lead Ads (Meta)

- **Entrada:** app de Meta suscrita al campo `leadgen` de la Página. Meta envía solo el
  `leadgen_id`; la función Inngest lo consulta con `GET /{leadgen_id}` (Graph API) usando el token
  de página y obtiene `field_data`, `form_id`, `ad_id`, `campaign_id`, `created_time`.
- **Verificación:** `GET` de suscripción con `hub.verify_token` → devolver `hub.challenge`; cada
  `POST` se valida con `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el App Secret).
- **Permisos:** `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`,
  `pages_read_engagement`, `ads_read` (gasto). Requieren **verificación del negocio y revisión de
  la app**. Hay que planificar varias semanas para ese trámite.
- **Respaldo:** un cron cada hora lista los leads recientes por formulario y recupera los que el
  webhook no entregó (idempotente por `external_lead_id`).
- **Consentimiento:** el formulario del anuncio debe enlazar la política de privacidad de Tekinsof;
  `consent_text` se copia a `ad_forms` y `consent_at` = hora de envío.

### 5.2 TikTok Lead Generation

- TikTok ofrece una **API personalizada con webhooks** para su formulario instantáneo, además de
  conectores de terceros ([Centro de ayuda de TikTok](https://ads.tiktok.com/help/article/available-crm-integrations-tiktok-lead-generation)).
- **Pendiente de confirmar al construir:** el formato exacto del payload y el método de firma no
  se pudieron verificar en esta investigación. El adaptador queda detrás de la misma interfaz
  (`parseLead(raw) → ExternalLead`), con un cron de recuperación por la Marketing API.
- **Plan B si la API se demora:** LeadsBridge o Zapier hacia el mismo endpoint de webhook, con un
  secreto propio. Funciona desde el primer día y se reemplaza sin tocar el resto.

### 5.3 Google Ads Lead Form

- Google hace `POST` JSON a la URL configurada en el recurso de formulario
  ([documentación del webhook](https://developers.google.com/google-ads/webhook/docs/implementation)).
- **Verificación:** campo `google_key` del cuerpo comparado con el secreto configurado por
  formulario en Google Ads (se guarda cifrado en `ad_forms`).
- **Campos:** `lead_id` (idempotencia), `user_column_data[]` con `column_id` (`FULL_NAME`,
  `EMAIL`, `PHONE_NUMBER`…) y `string_value`, `form_id`, `campaign_id`, `gcl_id`, `is_test`
  (se guarda marcado y no se asigna a nadie), `lead_submit_time`.
- Mapear por `column_id`, nunca por `column_name` (está deprecado). Ignorar campos desconocidos.

### 5.4 WhatsApp Business Cloud API

- **Número:** la R1 dejó claro que migrar el número actual a la API lo desconecta de la app del
  celular. Opciones: (a) **número nuevo** dedicado a la API (el más simple y sin riesgo);
  (b) migrar el número actual; (c) el modo de "coexistencia" de Meta (app + API en el mismo número)
  si está disponible para Perú en ese momento. **Verificar con Meta antes de decidir.**
- **Entrada:** el mismo webhook de Meta (campo `messages`), con firma `X-Hub-Signature-256`.
  Mensajes y cambios de estado (`sent`, `delivered`, `read`, `failed`) se guardan idempotentes
  por `wamid`.
- **Salida:** `POST /{phone_number_id}/messages`. Regla de la ventana:
  - dentro de las 24 h desde el último mensaje del prospecto → texto libre (bot o humano);
  - fuera de la ventana → **solo plantillas aprobadas**. La UI bloquea el texto libre y ofrece
    las plantillas.
- **Lead automático:** el primer mensaje de un número desconocido crea un lead `whatsapp_api`
  (dedup por teléfono E.164 en 24 h, igual que R1 por email). El consentimiento se registra
  cuando el bot o el vendedor envían el aviso de privacidad y el prospecto continúa.
- **Bandeja:** `/conversaciones` en el CRM: lista por estado, chat, notas internas, asignación,
  "tomar conversación" (apaga el bot) y "devolver al bot".

### 5.5 Claude (bot y calificación)

Ver §6. Integración por la API de Anthropic con el SDK oficial de TypeScript
(`@anthropic-ai/sdk`), llamada solo desde funciones Inngest. `ANTHROPIC_API_KEY` en `env.ts`.

### 5.6 Gasto publicitario

Cron diario 06:00 Lima: Meta Marketing API (insights por campaña), Google Ads API
(`metrics.cost_micros` por campaña; requiere developer token) y TikTok Reporting API. Une por
`campaigns.external_refs`. Si una API falla, el dashboard muestra "gasto al día X" en lugar de
cero.

---

## 6. Bot IA comercial

### 6.1 Qué hace y qué no

| Hace | No hace |
|---|---|
| Saluda en segundos y se presenta **como asistente virtual** de Tekinsof | Hacerse pasar por una persona |
| Responde sobre servicios con datos de `services` y `kb_articles` | Inventar precios, plazos o casos; da solo "desde" si el catálogo lo tiene |
| Pregunta necesidad, empresa, plazo y presupuesto de forma natural | Cerrar ventas, aceptar descuentos o enviar cotizaciones |
| Ofrece el enlace de Microsoft Bookings | Tratar datos sensibles; pide no enviarlos |
| Pasa a un humano cuando corresponde (§6.3) | Escribir fuera de la ventana de 24 h ni iniciar conversaciones |

### 6.2 Diseño técnico

- **Nivel:** *workflow* con herramientas, no un agente autónomo. Cada mensaje entrante dispara
  una función Inngest que arma el contexto, llama una vez a Claude (con su bucle de herramientas
  acotado) y envía la respuesta.
- **Modelo:** `claude-opus-5-5` con `thinking: {type: "adaptive"}` y `effort: "low"` para chat
  (conversaciones cortas y sensibles a la latencia). Se activa el parámetro de **fallbacks** del
  servidor para que un rechazo del clasificador no deje al prospecto sin respuesta.
  `claude-haiku-5-5` es la alternativa de menor costo; es una decisión de Tekinsof y se toma
  midiendo calidad con el set de evaluación (§6.5), no a priori.
- **Herramientas** (todas con `strict: true` y validadas otra vez en el servidor):
  - `buscar_servicio(consulta)` → servicios publicados y artículos de conocimiento.
  - `actualizar_lead(campos)` → solo `company_name`, `service_interest`, `job_title`, `timeline`,
    `budget_range`, `email`. Nunca `owner_id` ni `status`.
  - `ofrecer_reunion()` → devuelve el enlace de Bookings.
  - `derivar_a_humano(motivo, resumen)` → cambia la conversación a `humano`, asigna y notifica.
- **Contexto y caché:** la parte fija va primero y con `cache_control`: instrucciones,
  `persona_prompt`, catálogo y artículos. Después va lo variable: el historial de la conversación
  y los datos del lead. Así la mayoría de los tokens de entrada se cobra como lectura de caché.
- **Seguridad:** los mensajes del prospecto son datos, nunca instrucciones; las herramientas no
  exponen otros leads ni datos internos; límite de `max_bot_turns`; un vendedor puede apagar el
  bot por conversación y Gerencia globalmente desde `bot_configs`.
- **Trazabilidad:** cada respuesta escribe `bot_runs` (tokens, costo, herramientas, motivo de
  parada) y un `messages` con `author = bot`.

### 6.3 Reglas de derivación a humano

Se deriva cuando: el prospecto lo pide; el lead llega a grado **A**; pide precio cerrado,
propuesta o reunión inmediata; detecta molestia o reclamo; se alcanza `max_bot_turns`; el modelo
rechaza o falla dos veces; o el mensaje no es texto (audio, documento). En horario laboral la
derivación asigna al vendedor de la rotación de R1 y le notifica; fuera de horario, el bot
avisa cuándo lo contactarán y la conversación queda primera en la cola del día siguiente.

### 6.4 Protección de datos (Ley 29733)

- La política de privacidad del sitio debe declarar el uso de un asistente automatizado y la
  **transferencia de datos a un proveedor en el extranjero** (Anthropic, EE. UU.). Revisar con
  asesoría legal y actualizar el registro del banco de datos ante la ANPD.
- Al bot se le envía lo mínimo: la conversación y los campos del lead. Nada de cotizaciones,
  montos ni datos de otros clientes.

### 6.5 Calidad antes de encenderlo

1. Set de evaluación con 50–100 conversaciones reales anonimizadas (de WhatsApp manual de R1) y
   casos difíciles: precio, competencia, intento de manipular el bot, reclamo.
2. Criterios: no inventa precios, deriva cuando debe, español peruano correcto, extracción de
   campos exacta.
3. Piloto de 2 semanas solo **fuera de horario**; luego, el primer minuto en horario laboral.

---

## 7. Calificación automática de leads

**Dos capas, una nota explicable:**

1. **Reglas (`rule_score`, 0–100), instantáneas y gratuitas.** Señales con pesos editables en
   `scoring_models`: servicio de interés (p. ej. integración ERP > soporte puntual), empresa con
   RUC o dominio corporativo (no gmail), cargo, fuente (Google Lead Form con intención de
   búsqueda > formulario de TikTok), campaña, respuesta a WhatsApp y horario de contacto.
2. **IA (`ai_score`), solo si hay texto libre** (mensaje del formulario o conversación).
   Claude extrae con **structured outputs** (`output_config.format` con esquema JSON):
   `{ necesidad, presupuesto, plazo, rol_decision, tamano_empresa }`, cada uno con valor,
   confianza y la **cita textual** que lo sustenta. Sin cita, la señal vale cero.

`final_score = 0.6 × rule_score + 0.4 × ai_score` (pesos versionados) → grado A/B/C/D.

**Uso:**

- **A:** asignación inmediata más un aviso por correo y WhatsApp al vendedor; SLA de 1 hora
  laboral en lugar de 4.
- **B y C:** flujo de R1.
- **D:** se queda en la bandeja marcado "baja prioridad". **Nunca se descarta solo**; descartar
  sigue exigiendo una persona y un motivo.

Las reasons se muestran en la ficha del lead ("A porque: integración ERP, gerente de TI, plazo
este trimestre — cita: '…'"). A las 6 semanas se recalibran los pesos con los leads que de verdad
se convirtieron en oportunidad.

---

## 8. Dashboard de marketing y embudo

### Embudo comercial (definiciones)

| Etapa | Definición exacta |
|---|---|
| Lead | fila en `leads` (sin `is_test`, sin borrar) |
| Contactado | `first_contacted_at` no nulo |
| Calificado (MQL) | `status = calificado` o grado A/B |
| Oportunidad (SQL) | existe `opportunities.lead_id` |
| Propuesta | oportunidad con cotización `enviada` |
| Ganada | `opportunities.stage = ganada` |

Conversión entre etapas y **tiempo mediano entre etapas** (de `lead_stage_events`), filtrable por
canal, campaña, grado y vendedor.

### Indicadores del dashboard

| Indicador | Cálculo |
|---|---|
| Leads por canal y campaña | `mv_leads_daily` |
| Costo por lead (CPL) | `spend_cents / leads` por campaña y día, en PEN (tipo de cambio de `app_settings`) |
| Costo por oportunidad | gasto / oportunidades creadas con lead de esa campaña |
| ROAS | monto ganado (PEN) / gasto, con ventana de atribución de 90 días |
| Tiempo al primer contacto | mediana en horas laborables (`business-hours.ts`) |
| Desempeño del bot | conversaciones, % derivadas, % que agenda reunión, costo por conversación (`bot_runs`) |
| Calidad por canal | distribución A/B/C/D por fuente |

Atribución: **último toque con campaña conocida** (la del lead). La multitáctil se deja fuera:
con pocos meses de datos no es confiable.

---

## 9. APIs

### 9.1 Endpoints HTTP nuevos (CRM)

| Método | Ruta | Para qué | Autenticación |
|---|---|---|---|
| GET, POST | `/api/webhooks/meta` | Lead Ads (`leadgen`) y WhatsApp (`messages`, estados) | `hub.verify_token` en GET; `X-Hub-Signature-256` en POST |
| POST | `/api/webhooks/google-leads/:adFormId` | Google Lead Form | `google_key` por formulario |
| POST | `/api/webhooks/tiktok` | TikTok Lead Gen | firma de TikTok (a confirmar) o secreto propio si se usa conector |
| POST | `/api/public/forms/:slug/submit` | Envío de formularios del constructor | CORS a `SITE_ORIGIN` + Turnstile + honeypot (como R1) |
| GET | `/api/integrations/:provider/callback` | OAuth de Meta, TikTok y Google al conectar cuentas | sesión + `integrations.manage` + `state` firmado |

Todos los webhooks responden en menos de 1 s, aceptan reintentos sin duplicar y tienen límite de
peticiones en Vercel Firewall.

### 9.2 Eventos de dominio (outbox → Inngest)

| Evento | Lo emite | Lo consume |
|---|---|---|
| `inbound/received` `{ inboundEventId }` | cualquier webhook | `process-inbound`: parsea por proveedor → `ingestExternalLead` o `receiveMessage` |
| `lead/created` (existe en R1) | todo ingreso de lead | `score-lead` → luego `handleLeadCreated` (asignación usa el grado) |
| `conversation/message.received` | `receiveMessage` | `bot-reply` si `status = bot`, si no notificación al asignado |
| `conversation/handoff` | herramienta del bot o usuario | asignación + aviso |
| `whatsapp/message.send` | bot o usuario | `send-whatsapp` (respeta la ventana; reintentos) |
| cron `spend-sync` (diario) | — | `campaign_spend_daily` |
| cron `meta-leads-backfill`, `tiktok-leads-backfill` (cada hora) | — | recupera leads no entregados |
| cron `templates-sync` (cada hora) | — | `whatsapp_templates` |
| cron `dashboard-refresh` (cada 15 min) | — | vistas materializadas |
| cron `inbound-purge` (diario) | — | borra `inbound_events` de más de 90 días |

### 9.3 Servicios de core nuevos

| Módulo | Función | Permiso |
|---|---|---|
| `integrations/accounts.ts` | `connectAccount`, `disconnectAccount`, `listAccounts` | `integrations.manage` |
| `capture/external-leads.ts` | `ingestExternalLead(db, deps, { organizationId, provider, raw })` | sistema |
| `capture/ad-forms.ts` | `mapAdForm`, `listAdForms` | `campaigns.write` |
| `forms/forms.ts` | `createForm`, `updateFormDraft`, `publishForm`, `archiveForm` | `forms.write` |
| `forms/submit.ts` | `submitForm(db, deps, { slug, data, consent, turnstileToken, utm })` | público |
| `conversations/inbox.ts` | `listConversations`, `getConversation`, `assignConversation`, `takeOver`, `returnToBot`, `closeConversation` | `conversations.read` / `conversations.reply` |
| `conversations/whatsapp.ts` | `receiveMessage`, `sendText`, `sendTemplate`, `syncTemplates` | sistema / `conversations.reply` |
| `ai/sales-bot.ts` | `replyToConversation(db, deps, conversationId)` | sistema |
| `ai/lead-scoring.ts` | `scoreLead(db, deps, leadId)`, `activateScoringModel` | sistema / `settings.manage` |
| `marketing/spend.ts` | `syncSpend`, `adjustSpend` | sistema / `campaigns.write` |
| `marketing/dashboard.ts` | `getMarketingDashboard(db, actor, { from, to, filters })`, `getFunnel(...)` | `dashboard.marketing` |

**Permisos nuevos** en `permissions.ts`: `integrations.manage`, `forms.write`,
`conversations.read`, `conversations.reply`, `bot.configure`, `dashboard.marketing`.
Gerencia: todos. Marketing: `forms.write`, `dashboard.marketing`, `conversations.read`,
`bot.configure`. Ventas: `conversations.read`, `conversations.reply` (propias o sin asignar).

### 9.4 Pantallas nuevas del CRM

`/conversaciones` (bandeja de WhatsApp) · `/formularios` (constructor y vista previa) ·
`/campanas/:id` (rendimiento, formularios ligados, gasto) · `/marketing` (dashboard y embudo) ·
`/configuracion/integraciones` (conectar Meta, TikTok, Google y WhatsApp; estado de cada una) ·
`/configuracion/bot` (encendido, horario, persona, conocimiento, métricas) ·
`/configuracion/calificacion` (pesos y umbrales versionados).

---

## 10. Roadmap

Estimación para **1 desarrollador full-stack senior** con el mismo método de la R1 (pasos con
gate). Las semanas son de calendario. Los trámites de Meta y Google corren en paralelo desde F0.

| Fase | Contenido | Duración | Depende de |
|---|---|---|---|
| **F0 — Preparación** | CRM de R1 en producción; 4 semanas de leads reales; verificación del negocio en Meta; decisión del número de WhatsApp; developer token de Google Ads; actualizar la política de privacidad | 1 sem de trabajo + 2–6 sem de trámites en paralelo | R1 |
| **F1 — Base tenant-ready** | `organizations`, `memberships`, `organization_id` en todo, `Actor.organizationId`, test de arquitectura, `integration_accounts` cifrado, `inbound_events`, permisos nuevos | 2–3 sem | F0 |
| **F2 — Leads de anuncios** | Webhooks de Meta y Google, TikTok (o conector), `ad_forms` y su mapeo, backfill, pantalla de integraciones | 2–3 sem | F1 + app aprobada por Meta |
| **F3 — Formularios** | Constructor, versiones, bloque `form` en landings, endpoint público | 2 sem | F1 |
| **F4 — WhatsApp** | Webhook de mensajes, bandeja, envío con ventana de 24 h, plantillas, lead automático | 3 sem | F1 + número aprobado |
| **F5 — Calificación** | Reglas, extracción con IA, grado en bandeja, ruta A con SLA de 1 h | 2 sem | F2 o F3 |
| **F6 — Bot IA** | Bot con herramientas, derivación, `bot_runs`, set de evaluación, piloto fuera de horario | 3 sem + 2 sem de piloto | F4, F5 |
| **F7 — Campañas y dashboard** | Gasto diario, `lead_stage_events`, vistas, dashboard, embudo | 2–3 sem | F2; datos de F5 |
| **F8 — SaaS (futuro)** | RLS, onboarding de empresas, login para otros tenants, planes y cobro, dominios y sitio por cliente | 6–10 sem | Primer cliente externo comprometido |

**Total R2 (F0–F7): unas 17–21 semanas** de desarrollo. Las fases F2/F3 y F5/F7 pueden
solaparse con un segundo desarrollador, lo que baja el total a unas 12–14 semanas.

**Orden recomendado si hay que recortar:** F1 → F2 (los leads pagados son dinero que hoy se
pierde en CSV) → F4 → F5 → F7 → F3 → F6. El bot va al final porque depende de la bandeja, de la
calificación y de datos reales para evaluarlo.

---

## 11. Costos estimados

Montos en USD, con precios consultados en octubre de 2026. **Son estimaciones**: confirmar con
cada proveedor antes de presupuestar.

### 11.1 Operación mensual (Tekinsof, volumen inicial)

Supuestos: 600 leads/mes, 1.000 conversaciones de WhatsApp/mes (10 turnos promedio, la mitad con
bot), 300 plantillas de seguimiento/mes.

| Concepto | Estimado/mes | Nota |
|---|---|---|
| Vercel Pro | 20–40 | por miembro desarrollador del equipo |
| Supabase Pro | 25–35 | incluye cómputo pequeño; sube si crecen las vistas materializadas |
| Inngest | 0–75 | el plan gratuito puede bastar al inicio; verificar el límite de ejecuciones con los crons nuevos |
| Claude: bot | 80–120 | ≈ 0,15–0,25 por conversación de 10 turnos con caché; 500 conversaciones con bot |
| Claude: calificación | 5–10 | ≈ 0,01 por lead con texto libre |
| WhatsApp: mensajes de servicio | 0 | 1.000 gratis al mes por número; las respuestas dentro de las 24 h casi no cuestan |
| WhatsApp: plantillas | 6–25 | Perú: marketing ≈ 0,07; utility ≈ 0,02–0,03 por mensaje (las fuentes difieren tras el cambio del 1 oct 2026) |
| APIs de Meta, TikTok y Google (leads y reportes) | 0 | sin costo; el gasto en anuncios va aparte |
| Cloudflare Turnstile | 0 | |
| **Total aproximado** | **≈ 140–310** | sin contar la inversión en anuncios |

Cálculo del bot, por turno: unos 5.000 tokens de contexto fijo leídos de caché
(5.000 × 0,20/M = 0,001), unos 1.000 tokens nuevos (× 4/M = 0,004) y unos 500 de salida con
razonamiento breve (× 20/M = 0,010). Eso da ≈ 0,015 por turno y ≈ 0,15 por conversación de
10 turnos. Precios de `claude-opus-5-5`: 4 USD/M de entrada, 20 USD/M de salida y 0,20 USD/M de
lectura de caché. Con `claude-haiku-5-5` (0,10 / 0,50 USD/M) el costo baja unas 30–40 veces, si
el set de evaluación confirma que mantiene la calidad.

### 11.2 Desarrollo

| Escenario | Esfuerzo |
|---|---|
| R2 completa (F0–F7), 1 desarrollador | 17–21 semanas-persona |
| R2 recortada (F1, F2, F4, F5, F7) | 11–14 semanas-persona |
| F8 SaaS | 6–10 semanas-persona adicionales |

Para pasarlo a dinero: semanas × costo semanal del desarrollador (o del proveedor). Conviene
sumar un 15–20% de holgura por los trámites con Meta, Google y TikTok y por los cambios de sus
APIs.

### 11.3 Si se vuelve SaaS

El costo variable por empresa cliente lo dominan los mensajes de WhatsApp y el bot, y ambos se
pueden trasladar: plantillas al costo y bot por conversación. Infraestructura fija adicional en
F8: unos 50–150 USD/mes (Supabase con más cómputo, Vercel con más miembros, Inngest pagado).

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| La revisión de la app de Meta o la verificación del negocio se demora | Iniciarla en F0; mientras tanto, conector de terceros para los leads |
| Perder el WhatsApp del celular al migrar el número | Número nuevo para la API, o coexistencia si Meta la confirma para Perú |
| El bot inventa precios o promete plazos | Herramientas con datos cerrados, set de evaluación, piloto fuera de horario, derivación agresiva |
| Fuga de datos entre organizaciones al pasar a SaaS | `organization_id` desde F1, test de arquitectura y RLS antes del segundo cliente |
| Tokens de integración vencidos (el lead se pierde sin aviso) | `integration_accounts.status`, alerta a Gerencia y backfill horario |
| Tarifas de WhatsApp o de las APIs cambian | `messages.pricing_category` y `bot_runs` miden el costo real cada mes |
| Datos personales fuera del país | Política de privacidad, registro ANPD y datos mínimos al proveedor de IA |

---

## Fuentes consultadas

- Precios de WhatsApp Business Platform: [Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
  [HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000001428-whatsapp-pricing-billing-and-rebilling-guide),
  [Flowcall](https://www.flowcall.co/blog/whatsapp-business-api-pricing),
  [Manychat](https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide)
- TikTok Lead Generation, integraciones con CRM: [TikTok Ads Help](https://ads.tiktok.com/help/article/available-crm-integrations-tiktok-lead-generation)
- Webhook de Google Ads Lead Form: [Google Ads Developers](https://developers.google.com/google-ads/webhook/docs/implementation)
- Modelos y precios de Claude: documentación de la API de Anthropic (consultada el 2026-10-29)
