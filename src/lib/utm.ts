import type { Utm } from "@/db/schema";

export const UTM_COOKIE = "wp_utm";
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function utmFromSearch(sp: URLSearchParams): Utm | null {
  const out: Utm = {};
  for (const k of UTM_KEYS) {
    const v = sp.get(k);
    if (v) out[k] = v.slice(0, 120);
  }
  return Object.keys(out).length ? out : null;
}

export function parseUtmCookie(raw?: string | null): Utm | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    const out: Utm = {};
    for (const k of UTM_KEYS) if (typeof v[k] === "string") out[k] = v[k].slice(0, 120);
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Fallback traffic source for an order when the browser did not send one. */
export function sourceFromUtm(utm: Utm | null | undefined, fbc?: string | null) {
  const src = (utm?.utm_source ?? "").toLowerCase();
  if (["facebook", "fb", "instagram", "ig", "meta"].includes(src)) return "Meta ads";
  if (fbc) return "Meta ads";
  if (src === "google") return "Google ads";
  if (src === "tiktok") return "TikTok ads";
  return src ? src.slice(0, 40) : "Direct";
}
