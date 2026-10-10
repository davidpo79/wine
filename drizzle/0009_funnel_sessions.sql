ALTER TABLE "tracking_events" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX "tracking_events_order_idx" ON "tracking_events" USING btree ("order_id");