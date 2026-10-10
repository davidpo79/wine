CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"end_date" text,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "costs" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "addon_id" integer;--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");