CREATE TABLE "newsletter_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"content" jsonb NOT NULL,
	"audience" jsonb DEFAULT '{"tags":[],"excludeBuyersSince":null}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'import' NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"status_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_contacts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "newsletter_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"resend_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_contact_id_newsletter_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."newsletter_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nl_contacts_status_idx" ON "newsletter_contacts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "nl_sends_unique" ON "newsletter_sends" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "nl_sends_status_idx" ON "newsletter_sends" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "nl_sends_resend_idx" ON "newsletter_sends" USING btree ("resend_id");