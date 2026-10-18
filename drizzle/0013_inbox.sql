CREATE TABLE "inbox_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"resend_id" text,
	"message_id" text,
	"in_reply_to" text,
	"contact" text NOT NULL,
	"from_addr" text NOT NULL,
	"to_addrs" jsonb NOT NULL,
	"cc" jsonb,
	"subject" text DEFAULT '' NOT NULL,
	"text" text,
	"html" text,
	"attachments" jsonb,
	"order_id" text,
	"sent_by" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_messages_resend_id_unique" UNIQUE("resend_id")
);
--> statement-breakpoint
CREATE INDEX "inbox_contact_idx" ON "inbox_messages" USING btree ("contact","created_at");--> statement-breakpoint
CREATE INDEX "inbox_created_idx" ON "inbox_messages" USING btree ("created_at");