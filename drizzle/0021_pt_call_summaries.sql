ALTER TABLE "pt_calls" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "pt_calls" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "pt_calls" ADD COLUMN "summarized_at" timestamp with time zone;