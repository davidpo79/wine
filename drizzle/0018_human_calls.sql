CREATE TABLE "human_call_rep_endpoints" (
	"admin_id" integer PRIMARY KEY NOT NULL,
	"sip_username" text NOT NULL,
	"credential_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "human_call_rep_endpoints_sip_username_unique" UNIQUE("sip_username"),
	CONSTRAINT "human_call_rep_endpoints_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "human_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"lead_id" integer,
	"to_number" text NOT NULL,
	"from_number" text,
	"initiated_by" integer NOT NULL,
	"initiated_by_email" text,
	"call_control_id" text,
	"rep_call_control_id" text,
	"rep_sip_username" text,
	"call_session_id" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rep_answered_at" timestamp with time zone,
	"bridged_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	"hangup_cause" text,
	"answered_by" text,
	"amd_result" text,
	"human_answer_at" timestamp with time zone,
	"recording_status" text,
	"recording_key" text,
	"recording_duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "human_calls_call_control_id_unique" UNIQUE("call_control_id"),
	CONSTRAINT "human_calls_rep_call_control_id_unique" UNIQUE("rep_call_control_id")
);
--> statement-breakpoint
ALTER TABLE "human_call_rep_endpoints" ADD CONSTRAINT "human_call_rep_endpoints_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_calls" ADD CONSTRAINT "human_calls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_calls" ADD CONSTRAINT "human_calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_calls" ADD CONSTRAINT "human_calls_initiated_by_admin_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "human_calls_one_active_per_admin" ON "human_calls" USING btree ("initiated_by") WHERE status not in ('completed','rep_no_answer','no_answer','busy','failed','canceled');--> statement-breakpoint
CREATE INDEX "human_calls_order_idx" ON "human_calls" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "human_calls_lead_idx" ON "human_calls" USING btree ("lead_id");