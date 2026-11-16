-- The 6-bottle Black Friday box holds Galhofa only: 3 Tinto, 2 Branco, 1 Rosé (David, 16/11/2026). The product row
-- still listed D. Graça Branco (Admin → Products). Runs once.
UPDATE "products" SET "wines" = '[{"name":"Galhofa Tinto","vintage":"2024","type":"tinto","producer":"Douro"},{"name":"Galhofa Branco","vintage":"2025","type":"branco","producer":"Douro"},{"name":"Galhofa Rosé","vintage":"2025","type":"rose","producer":"Douro"}]'::jsonb WHERE "slug" = 'black-friday-douro-6';
