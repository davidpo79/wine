-- Buy-and-get offers (Wine Portugal pricing, 17/10/2026): delivery included in every option.
-- 1 box 49,90 € · 2 boxes 89,90 € (2nd box 40 €) · 4 boxes 149,70 € (pay 3, get 4). The 3-box bundle is retired.
UPDATE "bundles" SET "price_cents" = 4990, "compare_at_cents" = NULL, "shipping_cents" = 0, "label" = '1 caixa · 3 garrafas', "badge" = NULL, "sort" = 1, "active" = true WHERE "key" = 'x1';--> statement-breakpoint
UPDATE "bundles" SET "price_cents" = 8990, "compare_at_cents" = 9980, "shipping_cents" = 0, "label" = '2 caixas · 6 garrafas · a 2.ª caixa por 40 €', "badge" = 'Mais escolhido', "sort" = 2, "active" = true WHERE "key" = 'x2';--> statement-breakpoint
UPDATE "bundles" SET "active" = false WHERE "key" = 'x3';--> statement-breakpoint
INSERT INTO "bundles" ("product_id", "key", "label", "qty", "price_cents", "compare_at_cents", "shipping_cents", "badge", "sort", "active")
SELECT "id", 'x4', '4 caixas · 12 garrafas · pague 3, leve 4', 4, 14970, 19960, 0, 'Pague 3, leve 4', 3, true FROM "products" ORDER BY "id" LIMIT 1
ON CONFLICT ("product_id", "key") DO UPDATE SET "qty" = 4, "price_cents" = 14970, "compare_at_cents" = 19960, "shipping_cents" = 0, "label" = EXCLUDED."label", "badge" = EXCLUDED."badge", "sort" = 3, "active" = true;--> statement-breakpoint
-- The announcement bar still promising "free shipping from 2 boxes" is replaced; an edited one is left alone.
UPDATE "settings" SET "value" = '["Entrega antes do Natal","Encomendas até 30/11","Envio incluído em todas as opções","Pague 3, leve 4"]'::jsonb
WHERE "key" = 'announcement' AND "value"::text LIKE '%Portes grátis a partir de 2 caixas%';
