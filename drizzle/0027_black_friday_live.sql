-- Black Friday goes live (01/11/2026, David: "until it is live"). The setting row was saved with the switch off by the
-- seed on the previous deploy, so the default alone would not turn it on. Runs once.
UPDATE "settings" SET "value" = jsonb_set("value", '{enabled}', 'true'::jsonb) WHERE "key" = 'black_friday';--> statement-breakpoint
-- No reference ("usual") price on the Black Friday box: it was never sold at one (PAngV §11 / EU Omnibus).
UPDATE "bundles" SET "compare_at_cents" = NULL WHERE "key" IN ('bf1', 'bf2', 'bf3');
