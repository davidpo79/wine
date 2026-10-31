ALTER TABLE "pt_leads" ADD COLUMN "note_by" integer;--> statement-breakpoint
-- Existing notes: attributed to whoever last recorded an outcome on the lead (the note is saved with the outcome).
UPDATE "pt_leads" l SET "note_by" = x.admin_id
FROM (SELECT DISTINCT ON (lead_id) lead_id, admin_id FROM "pt_access_log" WHERE action = 'outcome' AND lead_id IS NOT NULL ORDER BY lead_id, created_at DESC) x
WHERE x.lead_id = l.id AND l."note" IS NOT NULL;
