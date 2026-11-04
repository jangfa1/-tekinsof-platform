DROP INDEX "uq_campaign_spend_daily";--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD COLUMN "ad_platform" text NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD COLUMN "external_campaign_id" text;--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD COLUMN "external_campaign_name" text;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD COLUMN "account_type" text DEFAULT 'page' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_spend_daily_external" ON "campaign_spend_daily" USING btree ("provider","external_campaign_id","ad_platform","date") WHERE "campaign_spend_daily"."external_campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_campaign_spend_daily_date" ON "campaign_spend_daily" USING btree ("date","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_spend_daily" ON "campaign_spend_daily" USING btree ("campaign_id","provider","ad_platform","date") WHERE "campaign_spend_daily"."external_campaign_id" is null;--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD CONSTRAINT "ck_campaign_spend_daily_platform" CHECK ("campaign_spend_daily"."ad_platform" in ('facebook','instagram','google','tiktok','otra'));--> statement-breakpoint
ALTER TABLE "campaign_spend_daily" ADD CONSTRAINT "ck_campaign_spend_daily_owner" CHECK ("campaign_spend_daily"."campaign_id" is not null or "campaign_spend_daily"."external_campaign_id" is not null);--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "ck_integration_accounts_type" CHECK ("integration_accounts"."account_type" in ('page','ad_account'));