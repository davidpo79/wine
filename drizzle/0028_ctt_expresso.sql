CREATE TABLE "ctt_closes" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text,
	"orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf" text,
	"sandbox" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "objects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "sub_product" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "close_id" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "last_event" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "alerted_events" jsonb DEFAULT '[]'::jsonb NOT NULL;