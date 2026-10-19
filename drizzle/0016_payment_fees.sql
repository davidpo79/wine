-- Payment fees from the providers' price lists (18/10/2026), without recoverable VAT:
-- Stripe EEA cards / wallets 1,5 % + 0,25 € · ifthenpay MB WAY 0,7 % + 0,07 € · Multibanco 1,5 % + 0,20 € · other 3 %.
UPDATE "settings"
SET "value" = jsonb_set("value", '{payment_fees}', '{"card":{"percent":1.5,"fixed_cents":25},"mb_way":{"percent":0.7,"fixed_cents":7},"multibanco":{"percent":1.5,"fixed_cents":20},"other":{"percent":3,"fixed_cents":0}}'::jsonb)
WHERE "key" = 'cost_model';
