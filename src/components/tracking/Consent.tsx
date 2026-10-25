"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouteLocale } from "@/lib/i18n/route-locale";
import { CONSENT_COPY, privacyHref } from "@/lib/i18n/consent";
import type { Locale } from "@/lib/markets";
import { newEventId, pixelEvent, track, visit } from "@/lib/track-client";

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
  // Meta click id: fb.1.<ms>.<fbclid>. Written unless marketing was refused.
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

/** Microsoft Clarity (session recordings and heatmaps), only with consent for statistics. Typed text is masked. */
function loadClarity(projectId: string) {
  if (!window.clarity) {
    const q: unknown[] = [];
    const c = ((...args: unknown[]) => void q.push(args)) as Window["clarity"] & { q?: unknown[] };
    c!.q = q;
    window.clarity = c;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
    document.head.appendChild(s);
  }
  window.clarity!("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  // Lets Admin → Funnel → a visit open the same visit's recording (filter by the wp_sid tag).
  const { sid, src } = visit();
  if (sid) window.clarity!("set", "wp_sid", sid);
  if (src) window.clarity!("set", "source", src);
}

/** Google Analytics 4, only after consent for statistics (the gtag stub and consent defaults are inline in the layout). */
function loadGa4(measurementId: string) {
  if (document.getElementById("wp-gtag")) return;
  window.gtag?.("js", new Date());
  window.gtag?.("config", measurementId);
  const s = document.createElement("script");
  s.id = "wp-gtag";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
}

/** Loads the Meta Pixel and fires the PageView, deduplicated with the server mirror through a shared event id. */
function startPixel(pixelId: string, mirrorToServer: boolean) {
  const wasLoaded = !!window.fbq;
  if (wasLoaded) window.fbq!("consent", "grant");
  setFbcFromClickId();
  loadPixel(pixelId);
  if (wasLoaded) return; // already running since the first page of the visit
  const id = window.__wpPageViewId ?? newEventId("pageview");
  window.__wpPageViewId = id;
  pixelEvent("PageView", {}, id);
  if (mirrorToServer) track("PageView", {}, id);
}

export function Consent({ pixelId, clarityId, ga4Id }: { pixelId: string | null; clarityId?: string | null; ga4Id?: string | null }) {
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
      if (c.s && ga4Id) loadGa4(ga4Id);
      if (c.s && clarityId) loadClarity(clarityId);
      else if (!c.s && window.clarity) {
        window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
        window.clarity("consent", false);
      }
      if (c.m && pixelId) startPixel(pixelId, !firstLoad);
    },
    [pixelId, clarityId, ga4Id],
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
      // No choice yet: the Meta Pixel runs from the first page (per David 25/10); "Rejeitar" switches it off.
      window.__wpConsent = { s: false, m: true };
      if (pixelId) startPixel(pixelId, false);
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
  }, [apply, pixelId]);

  function decide(c: Choice) {
    writeChoice(c);
    setOpen(false);
    setPrefs(false);
    apply(c, false);
  }

  if (!open) return null;
  const c = CONSENT_COPY[locale];
  // A compact card at the bottom that never blocks the page: the shop can be read, scrolled and tapped without
  // answering it (a dimmed full-screen sheet lost most ad visitors before they saw the offer, Oct 2026). "Rejeitar"
  // and "Aceitar" are the same size, side by side (GDPR: refusing is as easy as accepting); nothing is pre-ticked.
  const btn = "min-h-10 flex-1 rounded-md px-4 text-sm font-semibold";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:p-4">
      <div role="dialog" aria-modal="false" aria-labelledby="wp-consent-title" className="pointer-events-auto w-full max-w-md rounded-xl border border-gold/40 bg-night px-4 pb-3 pt-3 text-paper shadow-2xl">
        <p id="wp-consent-title" className="text-sm font-bold">{c.title}</p>
        <p className="mt-1 text-xs leading-snug text-paper/85">
          {c.text}{" "}
          <a href={privacyHref(locale)} className="underline underline-offset-2">{c.more}</a>
        </p>
        {prefs && (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2 opacity-70"><input type="checkbox" checked disabled className="h-4 w-4 accent-gold" /> {c.essential}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s} onChange={(e) => setS(e.target.checked)} className="h-4 w-4 accent-gold" /> {c.stats}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={m} onChange={(e) => setM(e.target.checked)} className="h-4 w-4 accent-gold" /> {c.marketing}</label>
          </div>
        )}
        <div className="mt-2.5 flex gap-2.5">
          <button data-testid="consent-reject" onClick={() => decide({ s: false, m: false })} className={`${btn} border border-paper/50 hover:bg-white/10`}>{c.reject}</button>
          <button data-testid="consent-accept" onClick={() => decide({ s: true, m: true })} className={`${btn} bg-gold text-night hover:bg-gold-soft`}>{c.accept}</button>
        </div>
        {prefs ? (
          <button data-testid="consent-save" onClick={() => decide({ s, m })} className="mt-2.5 min-h-10 w-full rounded-md border border-paper/30 text-sm font-semibold hover:bg-white/10">{c.save}</button>
        ) : (
          <button data-testid="consent-options" onClick={() => setPrefs(true)} className="mt-1 w-full py-1 text-xs text-paper/75 underline underline-offset-2 hover:text-paper">{c.options}</button>
        )}
      </div>
    </div>
  );
}

/** locale: the page's language when the caller knows it (pages without a language prefix, such as /obrigado). */
export function OpenConsentLink({ className, locale: pageLocale }: { className?: string; locale?: Locale }) {
  const routeLocale = useRouteLocale();
  const locale = pageLocale ?? routeLocale;
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("wp:open-consent"))}>
      {CONSENT_COPY[locale].prefs}
    </button>
  );
}
