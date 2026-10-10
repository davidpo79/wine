import { PER_BOX_FLOOR_CENTS } from "./settings-defaults";

/** `plusCode` (step 2 of the exit popup, mobile number) gives the same discount plus free shipping. */
export type PromoConfig = { code: string; percent: number; maxQty: number; plusCode?: string };

export function normalizeCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

function matches(cfg: PromoConfig, code: string | null | undefined) {
  const c = normalizeCode(code);
  return !!c && (c === normalizeCode(cfg.code) || (!!cfg.plusCode && c === normalizeCode(cfg.plusCode)));
}

/**
 * Discount for a bundle with a promo code. Applies only to bundles up to `maxQty` boxes and never
 * takes the price below the per-box floor that protects the B2B channel. Shared by client and server.
 */
export function promoDiscountCents(bundle: { priceCents: number; qty: number }, cfg: PromoConfig | null, code: string | null | undefined): number {
  if (!cfg || !cfg.code || cfg.percent <= 0 || !matches(cfg, code)) return 0;
  if (bundle.qty > cfg.maxQty) return 0;
  const raw = Math.round((bundle.priceCents * cfg.percent) / 100);
  const maxAllowed = bundle.priceCents - bundle.qty * PER_BOX_FLOOR_CENTS;
  return Math.max(0, Math.min(raw, maxAllowed));
}

/** Shipping after promo: the plus code makes shipping free (bundles of 2-3 boxes already ship free). */
export function promoShippingCents(bundle: { shippingCents: number }, cfg: PromoConfig | null, code: string | null | undefined): number {
  if (cfg?.plusCode && normalizeCode(code) === normalizeCode(cfg.plusCode)) return 0;
  return bundle.shippingCents;
}
