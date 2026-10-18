-- Unit costs given by David (18/10/2026), without recoverable VAT: espumante 7,00 €, porto 9,00 €, printed card 0,50 €.
UPDATE "settings"
SET "value" = (
  SELECT jsonb_agg(
    CASE
      WHEN p->>'name' ILIKE '%espumante%' THEN jsonb_set(p, '{cost_cents}', '700')
      WHEN p->>'name' ILIKE '%porto%' THEN jsonb_set(p, '{cost_cents}', '900')
      ELSE p
    END ORDER BY ord)
  FROM jsonb_array_elements("value") WITH ORDINALITY AS t(p, ord)
)
WHERE "key" = 'upsell_products' AND jsonb_typeof("value") = 'array' AND jsonb_array_length("value") > 0;
--> statement-breakpoint
UPDATE "settings" SET "value" = jsonb_set("value", '{cost_cents}', '50') WHERE "key" = 'gift_card';
