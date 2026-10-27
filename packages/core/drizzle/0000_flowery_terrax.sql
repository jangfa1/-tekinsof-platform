CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"owner_id" text NOT NULL,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_activities_type" CHECK ("activities"."type" in ('llamada','reunion','correo','whatsapp','tarea','nota')),
	CONSTRAINT "ck_activities_parent" CHECK ("activities"."lead_id" is not null or "activities"."opportunity_id" is not null or "activities"."contact_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"channel" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"budget_cents" bigint,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ck_campaigns_channel" CHECK ("campaigns"."channel" in ('google_ads','meta_ads','linkedin_ads','tiktok_ads','seo','email','whatsapp','referral','event','other')),
	CONSTRAINT "ck_campaigns_currency" CHECK ("campaigns"."currency" in ('PEN','USD'))
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ruc" text,
	"industry" text,
	"website" text,
	"phone" text,
	"address" text,
	"owner_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_companies_ruc" CHECK ("companies"."ruc" is null or "companies"."ruc" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"owner_id" text,
	"marketing_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"external_id" text NOT NULL,
	"contact_phone" text,
	"lead_id" uuid,
	"contact_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_conversations_channel" CHECK ("conversations"."channel" in ('whatsapp','email','web'))
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"campaign_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"whatsapp_message" text,
	"published_at" timestamp with time zone,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ck_landing_pages_status" CHECK ("landing_pages"."status" in ('borrador','publicada','archivada')),
	CONSTRAINT "ck_landing_pages_slug" CHECK ("landing_pages"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'nuevo' NOT NULL,
	"source" text NOT NULL,
	"campaign_id" uuid,
	"landing_slug" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"company_name" text,
	"service_interest" text,
	"message" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"gclid" text,
	"fbclid" text,
	"referrer" text,
	"consent_at" timestamp with time zone,
	"consent_version" text,
	"owner_id" text,
	"assigned_at" timestamp with time zone,
	"first_contacted_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone,
	"sla_alerted_at" timestamp with time zone,
	"discard_reason" text,
	"contact_id" uuid,
	"company_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_leads_status" CHECK ("leads"."status" in ('nuevo','contactado','calificado','descartado','convertido')),
	CONSTRAINT "ck_leads_source" CHECK ("leads"."source" in ('web_form','landing','whatsapp','referral','manual','event','other')),
	CONSTRAINT "ck_leads_reach" CHECK ("leads"."email" is not null or "leads"."phone" is not null),
	CONSTRAINT "ck_leads_public_consent" CHECK ("leads"."source" not in ('web_form','landing') or "leads"."consent_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"external_id" text,
	"body" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text,
	"sent_by" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_externalId_unique" UNIQUE("external_id"),
	CONSTRAINT "ck_messages_direction" CHECK ("messages"."direction" in ('in','out'))
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"stage" text DEFAULT 'calificacion' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"expected_close_on" date,
	"company_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"owner_id" text NOT NULL,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_opportunities_stage" CHECK ("opportunities"."stage" in ('calificacion','propuesta','negociacion','ganada','perdida')),
	CONSTRAINT "ck_opportunities_currency" CHECK ("opportunities"."currency" in ('PEN','USD')),
	CONSTRAINT "ck_opportunities_lost_reason" CHECK ("opportunities"."stage" <> 'perdida' or "opportunities"."lost_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "opportunity_services" (
	"opportunity_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "opportunity_services_opportunity_id_service_id_pk" PRIMARY KEY("opportunity_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ck_quote_items_quantity" CHECK ("quote_items"."quantity" > 0),
	CONSTRAINT "ck_quote_items_price" CHECK ("quote_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"owner_id" text NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"exchange_rate" numeric(10, 4) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"igv_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"issued_on" date,
	"valid_until" date,
	"notes" text,
	"terms" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"expiry_alerted_at" timestamp with time zone,
	"pdf_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_quotes_status" CHECK ("quotes"."status" in ('borrador','pendiente_aprobacion','aprobada','enviada','aceptada','rechazada','vencida','reemplazada')),
	CONSTRAINT "ck_quotes_currency" CHECK ("quotes"."currency" in ('PEN','USD')),
	CONSTRAINT "ck_quotes_discount" CHECK ("quotes"."discount_pct" >= 0 and "quotes"."discount_pct" <= 100),
	CONSTRAINT "ck_quotes_exchange_rate" CHECK ("quotes"."exchange_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'servicio' NOT NULL,
	"base_price_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_code_unique" UNIQUE("code"),
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ck_services_category" CHECK ("services"."category" in ('tecnologia','marketing')),
	CONSTRAINT "ck_services_unit" CHECK ("services"."unit" in ('servicio','hora','mes','licencia','proyecto')),
	CONSTRAINT "ck_services_currency" CHECK ("services"."currency" in ('PEN','USD'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_publishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"triggered_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'ventas' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"receives_leads" boolean DEFAULT true NOT NULL,
	"last_assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_services" ADD CONSTRAINT "opportunity_services_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_services" ADD CONSTRAINT "opportunity_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_publishes" ADD CONSTRAINT "site_publishes_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activities_due" ON "activities" USING btree ("due_at") WHERE "activities"."done_at" is null and "activities"."reminded_at" is null;--> statement-breakpoint
CREATE INDEX "idx_activities_opportunity" ON "activities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_activities_lead" ON "activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_target" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor" ON "audit_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_companies_ruc" ON "companies" USING btree ("ruc") WHERE "companies"."ruc" is not null and "companies"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_companies_owner" ON "companies" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contacts_email" ON "contacts" USING btree (lower("email")) WHERE "contacts"."email" is not null and "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_contacts_company" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_channel_external" ON "conversations" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "idx_leads_status_created" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_owner" ON "leads" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "idx_leads_email" ON "leads" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "idx_leads_sla" ON "leads" USING btree ("sla_due_at") WHERE "leads"."first_contacted_at" is null and "leads"."sla_alerted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" USING btree ("conversation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_opportunities_stage" ON "opportunities" USING btree ("stage","position");--> statement-breakpoint
CREATE INDEX "idx_opportunities_owner" ON "opportunities" USING btree ("owner_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunities_lead" ON "opportunities" USING btree ("lead_id") WHERE "opportunities"."lead_id" is not null and "opportunities"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_outbox_pending" ON "outbox" USING btree ("sent_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_quote_items_quote" ON "quote_items" USING btree ("quote_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quotes_number_version" ON "quotes" USING btree ("number","version");--> statement-breakpoint
CREATE INDEX "idx_quotes_opportunity" ON "quotes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_status_valid" ON "quotes" USING btree ("status","valid_until");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "verifications" USING btree ("identifier");