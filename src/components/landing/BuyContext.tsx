"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { newEventId, pixelEvent, track } from "@/lib/track-client";

export type PublicBundle = {
  key: string;
  label: string;
  qty: number;
  priceCents: number;
  compareAtCents: number | null;
  shippingCents: number;
  badge: string | null;
};

export type SalesMode = "open" | "after_christmas" | "closed" | "sold_out";

type Ctx = {
  bundles: PublicBundle[];
  selected: PublicBundle;
  select: (key: string) => void;
  isGift: boolean;
  setIsGift: (v: boolean) => void;
  giftMessage: string;
  setGiftMessage: (v: string) => void;
  checkout: () => Promise<void>;
  loading: boolean;
  error: string | null;
  mode: SalesMode;
};

const BuyCtx = createContext<Ctx | null>(null);

export function useBuy() {
  const c = useContext(BuyCtx);
  if (!c) throw new Error("useBuy outside BuyProvider");
  return c;
}

export const totalOf = (b: PublicBundle) => b.priceCents + b.shippingCents;

export function BuyProvider({ bundles, defaultKey, mode, children }: { bundles: PublicBundle[]; defaultKey: string; mode: SalesMode; children: React.ReactNode }) {
  const [key, setKey] = useState(bundles.find((b) => b.key === defaultKey)?.key ?? bundles[0]?.key);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = bundles.find((b) => b.key === key) ?? bundles[0];

  useEffect(() => {
    // Coming back from Stripe via the back button restores the page from bfcache: re-enable the button.
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

  const checkout = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const value = totalOf(selected) / 100;
    const atcId = track("AddToCart", { content_ids: ["trilogia-2160"], content_type: "product", value, currency: "EUR", num_items: selected.qty, bundle_key: selected.key }, newEventId("atc"));
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_key: selected.key, is_gift: isGift, gift_message: isGift ? giftMessage : "", event_id: atcId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.url) throw new Error(data.error ?? "Não foi possível iniciar o pagamento.");
      // InitiateCheckout is sent by the server (CAPI); the browser fires the same event_id for deduplication.
      pixelEvent("InitiateCheckout", { value: data.value, currency: "EUR", num_items: data.num_items, content_ids: ["trilogia-2160"], content_type: "product" }, data.initiate_event_id);
      window.gtag?.("event", "begin_checkout", { currency: "EUR", value: data.value, items: [{ item_id: "trilogia-2160", item_variant: selected.key, quantity: 1 }] });
      setTimeout(() => location.assign(data.url), 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setLoading(false);
    }
  }, [loading, selected, isGift, giftMessage]);

  const value = useMemo(
    () => ({ bundles, selected, select, isGift, setIsGift, giftMessage, setGiftMessage, checkout, loading, error, mode }),
    [bundles, selected, select, isGift, giftMessage, checkout, loading, error, mode],
  );
  return <BuyCtx.Provider value={value}>{children}</BuyCtx.Provider>;
}
