-- First-party visitor id for Meta CAPI external_id (David, 21/11/2026): kept on the order so InitiateCheckout and
-- Purchase carry the same id as the visitor's page views.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_id" text;
