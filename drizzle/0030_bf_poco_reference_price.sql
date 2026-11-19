-- Poço do Canto Black Friday: reference price of its Spanish ad (90 € a box), David 16/11/2026. Runs once.
UPDATE "bundles" SET "compare_at_cents" = 9000 WHERE "key" = 'bfp1';--> statement-breakpoint
UPDATE "bundles" SET "compare_at_cents" = 18000 WHERE "key" = 'bfp2';--> statement-breakpoint
UPDATE "bundles" SET "compare_at_cents" = 27000 WHERE "key" = 'bfp3';
