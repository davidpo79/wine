"use client";

import type { JourneyEvent } from "./journey";
import { newEventId, visit } from "./track-client";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

type Props = Record<string, string | number | boolean | null | string[]>;
type Queued = { n: JourneyEvent; ms: number; p?: Props; o?: string };

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let pageId = newEventId("p");
let pageStart = typeof performance !== "undefined" ? performance.now() : 0;
let locale: string | undefined;

// Shown as custom events in Clarity too, to filter recordings by funnel step.
const CLARITY_EVENTS = new Set<JourneyEvent>(["bundle_select", "checkout_view", "pay_click", "offer_shown", "payment_start", "payment_error", "thankyou_view", "rage_click", "js_error", "exit_popup_shown"]);

export function newPage(l?: string) {
  flushJourney();
  pageId = newEventId("p");
  pageStart = performance.now();
  if (l) locale = l;
}

export function pageMs() {
  return Math.max(0, Math.round(performance.now() - pageStart));
}

/** Records a step of the visit. Never pass typed values (names, emails, phones, addresses): field names only. */
export function jlog(n: JourneyEvent, p?: Props, orderId?: string) {
  if (typeof window === "undefined") return;
  queue.push({ n, ms: pageMs(), ...(p ? { p } : {}), ...(orderId ? { o: orderId } : {}) });
  if (CLARITY_EVENTS.has(n)) {
    try {
      window.clarity?.("event", n);
    } catch {}
  }
  if (queue.length >= 40) flushJourney();
  else if (!timer) timer = setTimeout(flushJourney, 2500);
}

export function flushJourney() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || typeof window === "undefined") return;
  const { sid, src } = visit();
  if (!sid) {
    queue = [];
    return;
  }
  const body = JSON.stringify({ sid, src, pid: pageId, path: location.pathname, locale, at: pageMs(), events: queue.splice(0, 60) });
  try {
    const sent = navigator.sendBeacon?.("/api/j", new Blob([body], { type: "text/plain" }));
    if (!sent) fetch("/api/j", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {}
  if (queue.length) timer = setTimeout(flushJourney, 500);
}
