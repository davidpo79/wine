-- CTT "Fragil" special service off (David, 16/11/2026): the contract does not include it for EMSF057.01 and every
-- label was refused. Runs once.
UPDATE "settings" SET "value" = 'false'::jsonb WHERE "key" = 'ctt_fragile';
