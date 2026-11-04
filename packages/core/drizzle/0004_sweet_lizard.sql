CREATE TABLE "lead_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"lead_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"is_conversion" boolean NOT NULL,
	"source" text NOT NULL,
	"ad_platform" text,
	"campaign_id" uuid,
	"landing_slug" text,
	"ad_form_id" uuid,
	"ad_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"gclid" text,
	"fbclid" text,
	"ttclid" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_lead_touchpoints_ad_platform" CHECK ("lead_touchpoints"."ad_platform" is null or "lead_touchpoints"."ad_platform" in ('facebook','instagram','tiktok','google'))
);
--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_ad_form_id_ad_forms_id_fk" FOREIGN KEY ("ad_form_id") REFERENCES "public"."ad_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_touchpoints_lead" ON "lead_touchpoints" USING btree ("lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_lead_touchpoints_campaign" ON "lead_touchpoints" USING btree ("campaign_id","occurred_at");