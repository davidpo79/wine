-- UGC creators upload their videos to the bucket; the admin reviews them per creator (David, 21/11/2026).
ALTER TABLE "creator_contracts" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"application_id" integer,
	"key" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"content_type" text,
	"upload_id" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"note" text,
	"uploaded_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_uploads_contract_idx" ON "creator_uploads" USING btree ("contract_id");
