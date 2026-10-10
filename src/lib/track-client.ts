"use client";

type Fbq = ((...args: unknown[]) => void) & { loaded?: boolean };
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fbq;
    gtag?: Gtag;
    dataLayer?: unknown[];
    __wpConsent?: { s: boolean; m: boolean };
    __wpPageViewId?: string;
  }
}

export type TrackName = "PageView" | "ViewContent" | "SelectBundle" | "AddToCart" | "InitiateCheckout" | "Purchase";
export type TrackData = {
  value?: number;
  currency?: "EUR";
  content_ids?: string[];
  content_type?: "product";
  num_items?: number;
  bundle_key?: string;
  order_id?: string;
};

const STANDARD = new Set(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]);
const GA4: Partial<Record<TrackName, string>> = {
  ViewContent: "view_item",
  SelectBundle: "select_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  // purchase is sent server-side via Measurement Protocol (transaction_id = order number)
};
const SERVER_MIRROR = new Set(["PageView", "ViewContent", "SelectBundle", "AddToCart"]);

export function newEventId(prefix: string) {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rnd}`;
}

export function pixelEvent(name: TrackName, data: TrackData, eventId: string) {
  if (!window.__wpConsent?.m || !window.fbq) return;
  const { bundle_key, order_id, ...rest } = data;
  const params = { ...rest, ...(bundle_key ? { bundle_key } : {}), ...(order_id ? { order_id } : {}) };
  window.fbq(STANDARD.has(name) ? "track" : "trackCustom", name, params, { eventID: eventId });
}

export function ga4Event(name: TrackName, data: TrackData) {
  const ga = GA4[name];
  if (!ga || !window.gtag) return;
  window.gtag("event", ga, {
    currency: "EUR",
    value: data.value,
    items: [{ item_id: "trilogia-2160", item_name: "Trilogia 2160", item_variant: data.bundle_key, quantity: 1 }],
  });
}

function mirror(name: TrackName, data: TrackData, eventId: string) {
  if (!SERVER_MIRROR.has(name)) return;
  const { order_id: _o, ...custom } = data;
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: name, event_id: eventId, url: location.href, custom_data: custom }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/** Fires an event in the browser (Pixel/GA4, consent permitting) and mirrors it to the server with the same event_id. */
export function track(name: TrackName, data: TrackData = {}, eventId = newEventId(name.toLowerCase())) {
  pixelEvent(name, data, eventId);
  ga4Event(name, data);
  mirror(name, data, eventId);
  return eventId;
}
