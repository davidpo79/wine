-- UGC creators who apply through /es/creadores (David, 21/11/2026).
CREATE TABLE IF NOT EXISTS "creator_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"handle" text NOT NULL,
	"followers" text,
	"portfolio" text,
	"message" text,
	"locale" text DEFAULT 'es' NOT NULL,
	"utm" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
