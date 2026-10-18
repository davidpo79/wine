CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider" text DEFAULT 'ctt' NOT NULL,
	"carrier_name" text,
	"tracking_id" text,
	"tracking_url" text,
	"label_pdf" text,
	"last_code" integer,
	"last_text" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_id");