-- Prices from the approved reference page: 2 boxes -10% (82,62 €), 3 boxes -15% (117,05 €), free shipping.
-- Only touches rows that still hold the original seed values, so admin edits are preserved.
UPDATE "bundles" SET "price_cents" = 8262 WHERE "key" = 'x2' AND "price_cents" = 8490 AND "compare_at_cents" = 9180;
--> statement-breakpoint
UPDATE "bundles" SET "price_cents" = 11705 WHERE "key" = 'x3' AND "price_cents" = 11990 AND "compare_at_cents" = 13770;
