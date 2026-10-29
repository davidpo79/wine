"use client";

import { useEffect } from "react";
import { pixelEvent } from "@/lib/track-client";
import { jlog } from "@/lib/journey-client";
import { contentIdFor } from "@/lib/black-friday";

/** Browser Purchase, deduplicated with the server CAPI Purchase through the shared event id. Only rendered when paid. */
export function PurchasePixel({ eventId, value, numItems, orderId, bundleKey }: { eventId: string; value: number; numItems: number; orderId: string; bundleKey?: string }) {
  useEffect(() => jlog("thankyou_view", { value }, orderId), [orderId, value]);
  useEffect(() => {
    const key = `wp_purchase_${orderId}`;
    if (sessionStorage.getItem(key)) return;
    let tries = 0;
    const t = setInterval(() => {
      // Wait for the consent component to load the Pixel (only if Marketing was accepted).
      if (window.fbq || ++tries > 20) {
        clearInterval(t);
        if (window.fbq && window.__wpConsent?.m) {
          pixelEvent("Purchase", { value, currency: "EUR", content_ids: [contentIdFor(bundleKey)], content_type: "product", num_items: numItems, order_id: orderId }, eventId);
          sessionStorage.setItem(key, "1");
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [eventId, value, numItems, orderId]);
  return null;
}
