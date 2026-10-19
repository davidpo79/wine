CREATE TABLE "pt_access_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"lead_id" integer,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value_hash" text NOT NULL,
	"scope" text DEFAULT 'all_marketing' NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"human_call_id" text NOT NULL,
	"lead_id" integer NOT NULL,
	"rep_id" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_calls_human_call_id_unique" UNIQUE("human_call_id")
);
--> statement-breakpoint
CREATE TABLE "pt_credit_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"reserved" integer NOT NULL,
	"settled" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "pt_credit_ledger_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "pt_enrichment_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"lead_id" integer NOT NULL,
	"apollo_person_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pt_enrichment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"apollo_request_id" text,
	"mode" text NOT NULL,
	"secret_hash" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"sync_credits" text,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "pt_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"apollo_person_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"company" text,
	"company_apollo_id" text,
	"company_size" integer,
	"location" text,
	"phone" text,
	"phone_type" text,
	"number_class" text DEFAULT 'unknown' NOT NULL,
	"legal_basis" text,
	"status" text DEFAULT 'new' NOT NULL,
	"status_before_call" text,
	"approved_at" timestamp with time zone,
	"approved_by" integer,
	"assigned_to" integer,
	"locked_by" integer,
	"lock_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"callback_at" timestamp with time zone,
	"note" text,
	"fail_reason" text,
	"source" text DEFAULT 'apollo' NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enriched_at" timestamp with time zone,
	"retention_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_leads_apollo_person_id_unique" UNIQUE("apollo_person_id")
);
--> statement-breakpoint
ALTER TABLE "pt_access_log" ADD CONSTRAINT "pt_access_log_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_access_log" ADD CONSTRAINT "pt_access_log_lead_id_pt_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."pt_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_blocks" ADD CONSTRAINT "pt_blocks_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_calls" ADD CONSTRAINT "pt_calls_human_call_id_human_calls_id_fk" FOREIGN KEY ("human_call_id") REFERENCES "public"."human_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_calls" ADD CONSTRAINT "pt_calls_lead_id_pt_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."pt_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_calls" ADD CONSTRAINT "pt_calls_rep_id_admin_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_credit_ledger" ADD CONSTRAINT "pt_credit_ledger_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_enrichment_items" ADD CONSTRAINT "pt_enrichment_items_request_id_pt_enrichment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pt_enrichment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_enrichment_items" ADD CONSTRAINT "pt_enrichment_items_lead_id_pt_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."pt_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_enrichment_requests" ADD CONSTRAINT "pt_enrichment_requests_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_leads" ADD CONSTRAINT "pt_leads_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_leads" ADD CONSTRAINT "pt_leads_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_leads" ADD CONSTRAINT "pt_leads_locked_by_admin_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pt_access_log_lead_idx" ON "pt_access_log" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pt_blocks_kind_hash_uq" ON "pt_blocks" USING btree ("kind","value_hash");--> statement-breakpoint
CREATE INDEX "pt_calls_lead_idx" ON "pt_calls" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "pt_calls_created_idx" ON "pt_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pt_credit_ledger_created_idx" ON "pt_credit_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pt_enrichment_items_req_person_uq" ON "pt_enrichment_items" USING btree ("request_id","apollo_person_id");--> statement-breakpoint
CREATE INDEX "pt_enrichment_items_lead_idx" ON "pt_enrichment_items" USING btree ("lead_id","state");--> statement-breakpoint
CREATE INDEX "pt_leads_assigned_idx" ON "pt_leads" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "pt_leads_status_idx" ON "pt_leads" USING btree ("status");