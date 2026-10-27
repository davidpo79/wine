CREATE TABLE "wa_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"pt_lead_id" integer,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"provider_id" text,
	"sent_by" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"raw" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_pt_lead_id_pt_leads_id_fk" FOREIGN KEY ("pt_lead_id") REFERENCES "public"."pt_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_lead_idx" ON "wa_messages" USING btree ("pt_lead_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_phone_idx" ON "wa_messages" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_provider_id_idx" ON "wa_messages" USING btree ("provider_id");