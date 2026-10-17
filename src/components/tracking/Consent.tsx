"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouteLocale } from "@/lib/i18n/route-locale";
import { CONSENT_COPY, privacyHref } from "@/lib/i18n/consent";
import { newEventId, pixelEvent, track } from "@/lib/track-client";

const COOKIE = "wp_consent";
const MAX_AGE = 60 * 60 * 24 * 180;

type Choice = { s: boolean; m: boolean };

function readCookie(name: string) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function readChoice(): Choice | null {
  const raw = readCookie(COOKIE);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return { s: v.s === 1, m: v.m === 1 };
  } catch {
    return null;
  }
}

function writeChoice(c: Choice) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ v: 1, s: c.s ? 1 : 0, m: c.m ? 1 : 0, t: Date.now() }))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

function updateConsentMode(c: Choice) {
  window.gtag?.("consent", "update", {
    analytics_storage: c.s ? "granted" : "denied",
    ad_storage: c.m ? "granted" : "denied",
    ad_user_data: c.m ? "granted" : "denied",
    ad_personalization: c.m ? "granted" : "denied",
  });
}

function setFbcFromClickId() {
  // Meta click id: fb.1.<ms>.<fbclid>. Only written after marketing consent.
  const fbclid = new URLSearchParams(location.search).get("fbclid") ?? sessionStorage.getItem("wp_fbclid");
  if (!fbclid || readCookie("_fbc")) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `_fbc=fb.1.${Date.now()}.${fbclid}; Max-Age=${60 * 60 * 24 * 90}; Path=/; SameSite=Lax${secure}`;
}

function loadPixel(pixelId: string) {
  if (window.fbq) return;
  /* Meta Pixel base code */
  const n = function (...args: unknown[]) {
    const self = n as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
    if (self.callMethod) self.callMethod(...args);
    else self.queue.push(args);
  } as unknown as Window["fbq"] & { push: unknown; loaded: boolean; version: string; queue: unknown[] };
  (n as unknown as { push: unknown }).push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  window.fbq = n;
  (window as unknown as { _fbq: unknown })._fbq = n;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  window.fbq!("init", pixelId);
}

export function Consent({ pixelId }: { pixelId: string | null }) {
  const locale = useRouteLocale();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [s, setS] = useState(false);
  const [m, setM] = useState(false);

  const apply = useCallback(
    (c: Choice, firstLoad: boolean) => {
      window.__wpConsent = c;
      updateConsentMode(c);
      if (!c.m && window.fbq) window.fbq("consent", "revoke");
      if (c.m && pixelId) {
        if (window.fbq) window.fbq("consent", "grant");
        setFbcFromClickId();
        loadPixel(pixelId);
        // PageView, deduplicated with the server mirror through a shared event id.
        const id = window.__wpPageViewId ?? newEventId("pageview");
        window.__wpPageViewId = id;
        pixelEvent("PageView", {}, id);
        if (!firstLoad) track("PageView", {}, id);
      }
    },
    [pixelId],
  );

  useEffect(() => {
    const fbclid = new URLSearchParams(location.search).get("fbclid");
    if (fbclid) sessionStorage.setItem("wp_fbclid", fbclid);
    const c = readChoice();
    // Anonymous page view for the funnel (and CAPI if consent already exists).
    window.__wpPageViewId = newEventId("pageview");
    track("PageView", {}, window.__wpPageViewId);
    if (c) {
      setS(c.s);
      setM(c.m);
      apply(c, true);
    } else {
      window.__wpConsent = { s: false, m: false };
      setOpen(true);
    }
    const reopen = () => {
      const cur = readChoice();
      setS(cur?.s ?? false);
      setM(cur?.m ?? false);
      setPrefs(true);
      setOpen(true);
    };
    window.addEventListener("wp:open-consent", reopen);
    return () => window.removeEventListener("wp:open-consent", reopen);
  }, [apply]);

  function decide(c: Choice) {
    writeChoice(c);
    setOpen(false);
    setPrefs(false);
    apply(c, false);
  }

  if (!open) return null;
  const c = CONSENT_COPY[locale];
  // Slim bottom bar. "Rejeitar" is as easy as "Aceitar" (GDPR); "Opções" expands the per-category choice.
  const btn = "min-h-9 rounded px-3 text-xs font-semibold whitespace-nowrap";
  return (
    <div role="dialog" aria-modal="false" aria-label="Cookies" className="fixed inset-x-0 bottom-0 z-[60] border-t border-gold/40 bg-night text-paper shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
        <p className="min-w-0 flex-1 basis-64 text-xs leading-snug text-paper/85">
          {c.text}{" "}
          <a href={privacyHref(locale)} className="underline underline-offset-2">{c.more}</a>
        </p>
        {prefs && (
          <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-xs sm:order-last">
            <label className="flex items-center gap-1.5 opacity-70"><input type="checkbox" checked disabled className="accent-gold" /> {c.essential}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={s} onChange={(e) => setS(e.target.checked)} className="accent-gold" /> {c.stats}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={m} onChange={(e) => setM(e.target.checked)} className="accent-gold" /> {c.marketing}</label>
          </div>
        )}
        <div className="flex shrink-0 gap-2">
          {prefs ? (
            <button onClick={() => decide({ s, m })} className={`${btn} border border-paper/40 hover:bg-white/10`}>{c.save}</button>
          ) : (
            <button onClick={() => setPrefs(true)} className={`${btn} underline underline-offset-2 hover:bg-white/10`}>{c.options}</button>
          )}
          <button onClick={() => decide({ s: false, m: false })} className={`${btn} border border-paper/40 hover:bg-white/10`}>{c.reject}</button>
          <button onClick={() => decide({ s: true, m: true })} className={`${btn} bg-gold text-night hover:bg-gold-soft`}>{c.accept}</button>
        </div>
      </div>
    </div>
  );
}

export function OpenConsentLink({ className }: { className?: string }) {
  const locale = useRouteLocale();
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("wp:open-consent"))}>
      {CONSENT_COPY[locale].prefs}
    </button>
  );
}
