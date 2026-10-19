CREATE TABLE "pt_access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"action" text NOT NULL,
	"lead_ids" jsonb NOT NULL,
	"detail" jsonb NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_blocks" (
	"key_hash" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "pt_blocks_key_hash_pk" PRIMARY KEY("key_hash")
);
--> statement-breakpoint
CREATE TABLE "pt_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"uid" text NOT NULL,
	"status" text NOT NULL,
	"rep_call_control_id" text,
	"customer_call_control_id" text,
	"refused_reason" text,
	"day" text NOT NULL,
	"started_at" bigint NOT NULL,
	"answered_at" bigint,
	"ended_at" bigint
);
--> statement-breakpoint
CREATE TABLE "pt_credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"month" text NOT NULL,
	"credits_reserved" numeric NOT NULL,
	"credits_sync" numeric,
	"credits_async" numeric,
	"credits_actual" numeric,
	"status" text NOT NULL,
	"enrich_id" text,
	"uid" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_enrich_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"apollo_request_id" text,
	"mode" text NOT NULL,
	"secret_hash" text,
	"lead_ids" jsonb NOT NULL,
	"apollo_ids" jsonb NOT NULL,
	"ledger_id" text,
	"status" text NOT NULL,
	"credits_settled" boolean DEFAULT false NOT NULL,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"last_delivery_at" bigint
);
--> statement-breakpoint
CREATE TABLE "pt_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"apollo_id" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"fetched_at" bigint NOT NULL,
	"batch_id" text,
	"first_name" text,
	"last_name" text,
	"last_name_obfuscated" text,
	"title" text,
	"company_name" text,
	"employee_range" text,
	"employee_count" integer,
	"city" text,
	"phone_e164" text,
	"email_business" text,
	"status" text NOT NULL,
	"status_before_call" text,
	"assigned_uid" text,
	"approved_at" bigint,
	"approved_by" text,
	"enrich_state" text DEFAULT 'none' NOT NULL,
	"enrich_id" text,
	"fail_reason" text,
	"number_class" text DEFAULT 'unknown' NOT NULL,
	"legal_basis" text,
	"eligibility_note" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"follow_up_at" bigint,
	"lock_uid" text,
	"lock_expires_at" bigint,
	"last_call_at" bigint,
	"notes" text,
	"last_activity_at" bigint NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "pt_leads_apollo_id_unique" UNIQUE("apollo_id")
);
--> statement-breakpoint
CREATE TABLE "pt_phone_endpoints" (
	"uid" text PRIMARY KEY NOT NULL,
	"sip_username" text NOT NULL,
	"credential_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pt_access_log_at_idx" ON "pt_access_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "pt_calls_day_idx" ON "pt_calls" USING btree ("day","uid");--> statement-breakpoint
CREATE INDEX "pt_calls_lead_idx" ON "pt_calls" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "pt_credit_ledger_month_idx" ON "pt_credit_ledger" USING btree ("month","day");--> statement-breakpoint
CREATE INDEX "pt_leads_assigned_idx" ON "pt_leads" USING btree ("assigned_uid","demo");