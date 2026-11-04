ALTER TABLE "quote_items" ADD COLUMN "section" text DEFAULT 'servicio' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "item_type" text DEFAULT 'implementacion' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "part_number" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "intro" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "delivery_time" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "warranty" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "exclusions" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "observations" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "ck_quote_items_section" CHECK ("quote_items"."section" in ('producto','servicio'));--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "ck_quote_items_type" CHECK (("quote_items"."section" = 'producto' and "quote_items"."item_type" in ('hardware','software','licencia','equipo','suscripcion'))
        or ("quote_items"."section" = 'servicio' and "quote_items"."item_type" in ('implementacion','capacitacion','soporte','consultoria','desarrollo','automatizacion')));