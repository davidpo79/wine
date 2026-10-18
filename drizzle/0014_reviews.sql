CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"text" text,
	"display_name" text NOT NULL,
	"country" text NOT NULL,
	"locale" text NOT NULL,
	"consent_publish" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reply" text,
	"moderated_by" text,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status","created_at");--> statement-breakpoint
-- Orders already shipped before reviews existed are not invited.
UPDATE "orders" SET "review_requested_at" = now() WHERE "status" IN ('shipped', 'delivered');
