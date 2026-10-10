ALTER TABLE "leads" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "consent_phone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone_consent_text" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone_added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_notes" text;