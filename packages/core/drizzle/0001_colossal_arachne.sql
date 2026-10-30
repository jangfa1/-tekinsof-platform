CREATE TABLE "ad_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"provider" text NOT NULL,
	"external_form_id" text NOT NULL,
	"name" text NOT NULL,
	"campaign_id" uuid,
	"integration_account_id" uuid,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_text" text,
	"webhook_key_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ad_forms_provider" CHECK ("ad_forms"."provider" in ('meta','tiktok','google_ads'))
);
--> statement-breakpoint
CREATE TABLE "campaign_spend_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"campaign_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"date" date NOT NULL,
	"spend_cents" bigint NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"platform_leads" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_campaign_spend_daily_provider" CHECK ("campaign_spend_daily"."provider" in ('meta','tiktok','google_ads','manual')),
	CONSTRAINT "ck_campaign_spend_daily_amount" CHECK ("campaign_spend_daily"."spend_cents" >= 0),
	CONSTRAINT "ck_campaign_spend_daily_currency" CHECK ("campaign_spend_daily"."currency" in ('PEN','USD'))
);
--> statement-breakpoint
CREATE TABLE "inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"status" text DEFAULT 'recibido' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "ck_inbound_events_provider" CHECK ("inbound_events"."provider" in ('meta','tiktok','google_ads')),
	CONSTRAINT "ck_inbound_events_status" CHECK ("inbound_events"."status" in ('recibido','procesado','ignorado','error'))
);
--> statement-breakpoint
CREATE TABLE "integration_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'conectada' NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"token_expires_at" timestamp with time zone,
	"connected_by" text,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_integration_accounts_provider" CHECK ("integration_accounts"."provider" in ('meta','tiktok','google_ads')),
	CONSTRAINT "ck_integration_accounts_status" CHECK ("integration_accounts"."status" in ('conectada','expirada','revocada','error'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"ruc" text,
	"timezone" text DEFAULT 'America/Lima' NOT NULL,
	"locale" text DEFAULT 'es-PE' NOT NULL,
	"status" text DEFAULT 'activa' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ck_organizations_status" CHECK ("organizations"."status" in ('activa','suspendida'))
);
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "ck_leads_source";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "ck_leads_public_consent";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "external_refs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ttclid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "external_lead_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_form_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "adset_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_platform" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "raw_answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_forms" ADD CONSTRAINT "ad_forms_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_forms" ADD CONSTRAINT "ad_forms_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD CONSTRAINT "campaign_spend_daily_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ad_forms_external" ON "ad_forms" USING btree ("organization_id","provider","external_form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_spend_daily" ON "campaign_spend_daily" USING btree ("campaign_id","provider","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inbound_events_external" ON "inbound_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_events_status" ON "inbound_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_integration_accounts_external" ON "integration_accounts" USING btree ("organization_id","provider","external_account_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ad_form_id_ad_forms_id_fk" FOREIGN KEY ("ad_form_id") REFERENCES "public"."ad_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leads_external" ON "leads" USING btree ("source","external_lead_id") WHERE "leads"."external_lead_id" is not null;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_ad_platform" CHECK ("leads"."ad_platform" is null or "leads"."ad_platform" in ('facebook','instagram','tiktok','google'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_source" CHECK ("leads"."source" in ('web_form','landing','whatsapp','referral','manual','event','other','meta_lead_ads','tiktok_lead_ads','google_lead_form'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_public_consent" CHECK ("leads"."source" not in ('web_form','landing','meta_lead_ads','tiktok_lead_ads','google_lead_form') or "leads"."consent_at" is not null);