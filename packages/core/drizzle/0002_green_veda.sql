CREATE TABLE "lead_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"lead_id" uuid NOT NULL,
	"scoring_model_version" integer NOT NULL,
	"score" integer NOT NULL,
	"grade" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"inputs" jsonb NOT NULL,
	"scored_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_lead_scores_grade" CHECK ("lead_scores"."grade" in ('A','B','C','D')),
	CONSTRAINT "ck_lead_scores_score" CHECK ("lead_scores"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "scoring_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_models_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "budget_range" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company_type" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_models" ADD CONSTRAINT "scoring_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_scores_lead" ON "lead_scores" USING btree ("lead_id","scored_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scoring_models_active" ON "scoring_models" USING btree ("is_active") WHERE "scoring_models"."is_active";--> statement-breakpoint
CREATE INDEX "idx_leads_grade" ON "leads" USING btree ("grade","created_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_company_size" CHECK ("leads"."company_size" is null or "leads"."company_size" in ('1-10','11-50','51-200','201+'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_budget_range" CHECK ("leads"."budget_range" is null or "leads"."budget_range" in ('hasta-5k','5k-20k','20k-50k','mas-50k'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_company_type" CHECK ("leads"."company_type" is null or "leads"."company_type" in ('privada','publica','ong','independiente'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_grade" CHECK ("leads"."grade" is null or "leads"."grade" in ('A','B','C','D'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "ck_leads_score" CHECK ("leads"."score" is null or "leads"."score" between 0 and 100);