-- Black Friday: Portuguese delivery addresses too (David, 16/11/2026), wine VAT 13%. Runs once.
UPDATE "settings" SET "value" = jsonb_set(jsonb_set("value", '{countries}', (("value"->'countries') || '["PT"]'::jsonb)), '{vat_percent,PT}', '13'::jsonb) WHERE "key" = 'black_friday' AND NOT ("value"->'countries') ? 'PT';
