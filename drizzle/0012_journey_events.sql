CREATE TABLE "journey_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"page_id" text,
	"name" text NOT NULL,
	"path" text,
	"props" jsonb,
	"ms" integer,
	"source" text,
	"device" text,
	"browser" text,
	"country" text,
	"locale" text,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "journey_session_idx" ON "journey_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "journey_name_idx" ON "journey_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "journey_created_idx" ON "journey_events" USING btree ("created_at");