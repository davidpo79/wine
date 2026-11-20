-- Black Friday welcome sequence (David, 20/11/2026): one email a day from signup until the Black Friday cutoff.
CREATE TABLE IF NOT EXISTS "bf_welcome_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"locale" text NOT NULL,
	"day" integer NOT NULL,
	"kind" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bf_welcome_email_day" ON "bf_welcome_emails" USING btree ("email","day");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bf_welcome_due_idx" ON "bf_welcome_emails" USING btree ("status","scheduled_at");
