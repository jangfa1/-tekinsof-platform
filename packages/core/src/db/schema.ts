// The single source of truth for every table (Release 1 and Release 2). Column names are snake_case in SQL and
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

// Tenant-ready (Release 2): every business table carries the owning organization. Until a second
// organization exists nothing filters by it, so the column has no FK and defaults to Tekinsof;
// the FK, composite indexes, service filtering and RLS arrive together (design.md §3, phase F8).
export const DEFAULT_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const organizationId = () => uuid().notNull().default(DEFAULT_ORGANIZATION_ID);

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
export const organizations = pgTable(
  "organizations",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    legalName: text(),
    ruc: text(),
    timezone: text().notNull().default("America/Lima"),
    locale: text().notNull().default("es-PE"),
    status: text().notNull().default("activa"),
    settings: jsonb().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("ck_organizations_status", sql`${t.status} in ('activa','suspendida')`)],
);

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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    channel: text().notNull(),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    budgetCents: bigint({ mode: "number" }),
    currency: text().notNull().default("PEN"),
    isActive: boolean().notNull().default(true),
    // Ad platform campaign ids, e.g. { "meta": ["1202…"], "google_ads": ["2134…"] }.
    externalRefs: jsonb().notNull().default({}),
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
    organizationId: organizationId(),
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
    ttclid: text(),
    referrer: text(),
    externalLeadId: text(),
    adFormId: uuid().references(() => adForms.id, { onDelete: "set null" }),
    adId: text(),
    adsetId: text(),
    adPlatform: text(),
    rawAnswers: jsonb().notNull().default({}),
    // Qualification answers and the latest grade, denormalized from lead_scores to filter the inbox.
    companySize: text(),
    budgetRange: text(),
    companyType: text(),
    score: integer(),
    grade: text(),
    scoredAt: timestamp({ withTimezone: true }),
    isTest: boolean().notNull().default(false),
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
    uniqueIndex("uq_leads_external")
      .on(t.source, t.externalLeadId)
      .where(sql`${t.externalLeadId} is not null`),
    check(
      "ck_leads_source",
      sql`${t.source} in ('web_form','landing','whatsapp','referral','manual','event','other','meta_lead_ads','tiktok_lead_ads','google_lead_form')`,
    ),
    check("ck_leads_reach", sql`${t.email} is not null or ${t.phone} is not null`),
    check(
      "ck_leads_public_consent",
      sql`${t.source} not in ('web_form','landing','meta_lead_ads','tiktok_lead_ads','google_lead_form') or ${t.consentAt} is not null`,
    ),
    check(
      "ck_leads_ad_platform",
      sql`${t.adPlatform} is null or ${t.adPlatform} in ('facebook','instagram','tiktok','google')`,
    ),
    index("idx_leads_grade").on(t.grade, t.createdAt),
    check(
      "ck_leads_company_size",
      sql`${t.companySize} is null or ${t.companySize} in ('1-10','11-50','51-200','201+')`,
    ),
    check(
      "ck_leads_budget_range",
      sql`${t.budgetRange} is null or ${t.budgetRange} in ('hasta-5k','5k-20k','20k-50k','mas-50k')`,
    ),
    check(
      "ck_leads_company_type",
      sql`${t.companyType} is null or ${t.companyType} in ('privada','publica','ong','independiente')`,
    ),
    check("ck_leads_grade", sql`${t.grade} is null or ${t.grade} in ('A','B','C','D')`),
    check("ck_leads_score", sql`${t.score} is null or ${t.score} between 0 and 100`),
  ],
);

// ─── Lead scoring (rule-based; design.md §4.5 without the AI layer) ──────────────────────────

export const scoringModels = pgTable(
  "scoring_models",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    version: integer().notNull().unique(),
    rules: jsonb().notNull(),
    thresholds: jsonb().notNull(),
    isActive: boolean().notNull().default(false),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_scoring_models_active").on(t.isActive).where(sql`${t.isActive}`)],
);

export const leadScores = pgTable(
  "lead_scores",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    scoringModelVersion: integer().notNull(),
    score: integer().notNull(),
    grade: text().notNull(),
    reasons: jsonb().notNull(),
    inputs: jsonb().notNull(),
    scoredAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_lead_scores_lead").on(t.leadId, t.scoredAt),
    check("ck_lead_scores_grade", sql`${t.grade} in ('A','B','C','D')`),
    check("ck_lead_scores_score", sql`${t.score} between 0 and 100`),
  ],
);

// ─── Sales: opportunities and activities ─────────────────────────────────────────────────────
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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
    organizationId: organizationId(),
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

// ─── Paid capture (Release 2): ad platform accounts, raw webhooks, lead forms, spend ─────────
const adProviders = sql`('meta','tiktok','google_ads')`;

export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    provider: text().notNull(),
    externalAccountId: text().notNull(),
    displayName: text().notNull(),
    status: text().notNull().default("conectada"),
    // AES-256-GCM envelope from integrations/secrets.ts; never plain text.
    credentialsEncrypted: text().notNull(),
    keyVersion: integer().notNull().default(1),
    tokenExpiresAt: timestamp({ withTimezone: true }),
    connectedBy: text().references(() => users.id, { onDelete: "set null" }),
    lastOkAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_integration_accounts_external").on(
      t.organizationId,
      t.provider,
      t.externalAccountId,
    ),
    check("ck_integration_accounts_provider", sql`${t.provider} in ${adProviders}`),
    check(
      "ck_integration_accounts_status",
      sql`${t.status} in ('conectada','expirada','revocada','error')`,
    ),
  ],
);

// Every webhook body as received, idempotent per provider id. Purged after 90 days (personal data).
export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    provider: text().notNull(),
    eventType: text().notNull(),
    externalId: text().notNull(),
    payload: jsonb().notNull(),
    signatureValid: boolean().notNull(),
    status: text().notNull().default("recibido"),
    attempts: integer().notNull().default(0),
    error: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_inbound_events_external").on(t.provider, t.externalId),
    index("idx_inbound_events_status").on(t.status, t.receivedAt),
    check("ck_inbound_events_provider", sql`${t.provider} in ${adProviders}`),
    check(
      "ck_inbound_events_status",
      sql`${t.status} in ('recibido','procesado','ignorado','error')`,
    ),
  ],
);

export const adForms = pgTable(
  "ad_forms",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    provider: text().notNull(),
    externalFormId: text().notNull(),
    name: text().notNull(),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    integrationAccountId: uuid().references(() => integrationAccounts.id, {
      onDelete: "set null",
    }),
    // Provider question key → lead field; overrides the adapter's defaults.
    fieldMapping: jsonb().notNull().default({}),
    consentText: text(),
    webhookKeyEncrypted: text(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_ad_forms_external").on(t.organizationId, t.provider, t.externalFormId),
    check("ck_ad_forms_provider", sql`${t.provider} in ${adProviders}`),
  ],
);

export const campaignSpendDaily = pgTable(
  "campaign_spend_daily",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    date: date({ mode: "string" }).notNull(),
    spendCents: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("PEN"),
    impressions: integer(),
    clicks: integer(),
    platformLeads: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_campaign_spend_daily").on(t.campaignId, t.provider, t.date),
    check(
      "ck_campaign_spend_daily_provider",
      sql`${t.provider} in ('meta','tiktok','google_ads','manual')`,
    ),
    check("ck_campaign_spend_daily_amount", sql`${t.spendCents} >= 0`),
    check("ck_campaign_spend_daily_currency", sql`${t.currency} in ('PEN','USD')`),
  ],
);
