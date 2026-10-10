import { PER_BOX_FLOOR_CENTS } from "./settings-defaults";

export type PromoConfig = { code: string; percent: number; maxQty: number };

export function normalizeCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

/**
 * Discount for a bundle with a promo code. Applies only to bundles up to `maxQty` boxes and never
 * takes the price below the per-box floor that protects the B2B channel. Shared by client and server.
 */
export function promoDiscountCents(bundle: { priceCents: number; qty: number }, cfg: PromoConfig | null, code: string | null | undefined): number {
  if (!cfg || !cfg.code || cfg.percent <= 0) return 0;
  if (normalizeCode(code) !== normalizeCode(cfg.code)) return 0;
  if (bundle.qty > cfg.maxQty) return 0;
  const raw = Math.round((bundle.priceCents * cfg.percent) / 100);
  const maxAllowed = bundle.priceCents - bundle.qty * PER_BOX_FLOOR_CENTS;
  return Math.max(0, Math.min(raw, maxAllowed));
}
