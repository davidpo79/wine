CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"consent_marketing" boolean NOT NULL,
	"consent_text" text NOT NULL,
	"source" text DEFAULT 'exit_popup' NOT NULL,
	"promo_code" text,
	"utm" jsonb,
	"ip_hash" text,
	"reminder_sent_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");