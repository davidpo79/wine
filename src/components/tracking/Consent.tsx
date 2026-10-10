"use client";

import { useCallback, useEffect, useState } from "react";
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
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="consent-title" className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-lg border border-gold/40 bg-night text-paper shadow-2xl">
        <div className="p-4 sm:p-5">
          <h2 id="consent-title" className="font-serif text-xl">Cookies e privacidade</h2>
          <p className="mt-1 text-sm text-paper/80">
            Usamos cookies essenciais para o site funcionar. Com a sua autorização, usamos também cookies de estatística (Google Analytics) e de
            marketing (Meta) para medir e melhorar os nossos anúncios. Pode mudar a escolha a qualquer momento no rodapé.{" "}
            <a href="/privacidade" className="underline decoration-gold underline-offset-2">Saber mais</a>
          </p>
          {prefs && (
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-start gap-3 rounded bg-white/5 p-3">
                <input type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-gold" />
                <span><strong>Essenciais</strong> · sempre ativos (sessão, verificação de idade, a sua escolha de cookies).</span>
              </label>
              <label className="flex items-start gap-3 rounded bg-white/5 p-3">
                <input type="checkbox" checked={s} onChange={(e) => setS(e.target.checked)} className="mt-1 h-4 w-4 accent-gold" />
                <span><strong>Estatística</strong> · Google Analytics, para perceber como o site é usado.</span>
              </label>
              <label className="flex items-start gap-3 rounded bg-white/5 p-3">
                <input type="checkbox" checked={m} onChange={(e) => setM(e.target.checked)} className="mt-1 h-4 w-4 accent-gold" />
                <span><strong>Marketing</strong> · Meta Pixel e Conversions API, para medir anúncios no Facebook e Instagram.</span>
              </label>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button onClick={() => decide({ s: false, m: false })} className="min-h-11 rounded border border-paper/40 px-4 text-sm font-semibold hover:bg-white/10">
              Rejeitar tudo
            </button>
            {prefs ? (
              <button onClick={() => decide({ s, m })} className="min-h-11 rounded border border-paper/40 px-4 text-sm font-semibold hover:bg-white/10">
                Guardar escolha
              </button>
            ) : (
              <button onClick={() => setPrefs(true)} className="min-h-11 rounded border border-paper/40 px-4 text-sm font-semibold hover:bg-white/10">
                Preferências
              </button>
            )}
            <button onClick={() => decide({ s: true, m: true })} className="min-h-11 rounded bg-gold px-4 text-sm font-semibold text-night hover:bg-gold-soft">
              Aceitar tudo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpenConsentLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("wp:open-consent"))}>
      Preferências de cookies
    </button>
  );
}
