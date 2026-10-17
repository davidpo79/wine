ALTER TABLE "leads" ADD COLUMN "locale" text DEFAULT 'pt' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "country" text DEFAULT 'PT' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "locale" text DEFAULT 'pt' NOT NULL;