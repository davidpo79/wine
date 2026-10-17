"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { newEventId, track } from "@/lib/track-client";
import { promoDiscountCents, promoShippingCents, type PromoConfig } from "@/lib/promo";
import { useI18n } from "@/lib/i18n/client";

const PROMO_KEY = "wp_promo";
export const CUSTOMER_KEY = "wp_customer";

export type PublicBundle = {
  key: string;
  label: string;
  qty: number;
  priceCents: number;
  compareAtCents: number | null;
  shippingCents: number;
  badge: string | null;
};

export type SalesMode = "open" | "after_christmas" | "closed" | "sold_out" | "coming_soon";

type Ctx = {
  bundles: PublicBundle[];
  selected: PublicBundle;
  select: (key: string) => void;
  isGift: boolean;
  setIsGift: (v: boolean) => void;
  giftMessage: string;
  setGiftMessage: (v: string) => void;
  /** Goes to /checkout with the current choice. */
  checkout: () => Promise<void>;
  loading: boolean;
  error: string | null;
  mode: SalesMode;
  promo: string | null;
  promoConfig: PromoConfig | null;
  applyPromo: (code: string) => void;
  /** Discount for a bundle with the applied promo code (0 if none or not eligible). */
  discount: (b: PublicBundle) => number;
  /** Shipping after promo (plus code makes it free). */
  shipping: (b: PublicBundle) => number;
  /** Price after discount plus shipping. */
  total: (b: PublicBundle) => number;
};

const BuyCtx = createContext<Ctx | null>(null);

export function useBuy() {
  const c = useContext(BuyCtx);
  if (!c) throw new Error("useBuy outside BuyProvider");
  return c;
}

export const totalOf = (b: PublicBundle) => b.priceCents + b.shippingCents;

export function BuyProvider({ bundles, defaultKey, mode, promoConfig = null, children }: { bundles: PublicBundle[]; defaultKey: string; mode: SalesMode; promoConfig?: PromoConfig | null; children: React.ReactNode }) {
  const { locale, country } = useI18n();
  const [key, setKey] = useState(bundles.find((b) => b.key === defaultKey)?.key ?? bundles[0]?.key);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = bundles.find((b) => b.key === key) ?? bundles[0];
  const [promo, setPromo] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROMO_KEY);
      if (saved) setPromo(saved);
    } catch {}
  }, []);

  const applyPromo = useCallback((code: string) => {
    setPromo(code);
    try {
      localStorage.setItem(PROMO_KEY, code);
    } catch {}
  }, []);
  const discount = useCallback((b: PublicBundle) => promoDiscountCents(b, promoConfig, promo), [promoConfig, promo]);
  const shipping = useCallback((b: PublicBundle) => promoShippingCents(b, promoConfig, promo), [promoConfig, promo]);
  const total = useCallback((b: PublicBundle) => b.priceCents - promoDiscountCents(b, promoConfig, promo) + promoShippingCents(b, promoConfig, promo), [promoConfig, promo]);

  useEffect(() => {
    // Coming back from the checkout/payment page via the back button restores the page from bfcache: re-enable the button.
    const onShow = (e: PageTransitionEvent) => e.persisted && setLoading(false);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const select = useCallback(
    (k: string) => {
      if (k === key) return;
      setKey(k);
      const b = bundles.find((x) => x.key === k);
      if (b) track("SelectBundle", { bundle_key: b.key, value: totalOf(b) / 100, currency: "EUR" });
    },
    [key, bundles],
  );

  // "Encomendar" goes to the in-house checkout (/checkout), which creates and autosaves the order.
  const checkout = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      sessionStorage.setItem("wp_checkout_started", "1");
      sessionStorage.setItem("wp_gift", JSON.stringify({ isGift, msg: isGift ? giftMessage : "" }));
    } catch {}
    track("AddToCart", { content_ids: ["trilogia-2160"], content_type: "product", value: total(selected) / 100, currency: "EUR", num_items: selected.qty, bundle_key: selected.key }, newEventId("atc"));
    location.assign(`/checkout?b=${encodeURIComponent(selected.key)}${locale === "pt" ? "" : `&l=${locale}&c=${country}`}`);
  }, [loading, selected, total, isGift, giftMessage, locale, country]);

  const value = useMemo(
    () => ({ bundles, selected, select, isGift, setIsGift, giftMessage, setGiftMessage, checkout, loading, error, mode, promo, promoConfig, applyPromo, discount, shipping, total }),
    [bundles, selected, select, isGift, giftMessage, checkout, loading, error, mode, promo, promoConfig, applyPromo, discount, shipping, total],
  );
  return <BuyCtx.Provider value={value}>{children}</BuyCtx.Provider>;
}
