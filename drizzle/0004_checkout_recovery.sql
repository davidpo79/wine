CREATE TABLE "recovery_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"step" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"channels" jsonb,
	"result" jsonb,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "consent_messages" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "consent_calls" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_steps" ADD CONSTRAINT "recovery_steps_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_due_idx" ON "recovery_steps" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "recovery_order_idx" ON "recovery_steps" USING btree ("order_id");