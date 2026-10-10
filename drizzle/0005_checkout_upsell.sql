CREATE TABLE "order_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"sku" text NOT NULL,
	"label" text NOT NULL,
	"qty" integer NOT NULL,
	"boxes" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "order_addons_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recovery_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_addons_order_idx" ON "order_addons" USING btree ("order_id");