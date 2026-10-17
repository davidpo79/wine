"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouteLocale } from "@/lib/i18n/route-locale";
import { flushJourney, jlog, newPage, pageMs } from "@/lib/journey-client";

// Records the visit journey of every page automatically: page views and time on page, scroll depth, landing sections
// seen, clicks (and rage clicks), checkout field focus / completion / errors and JavaScript errors.
// Typed values are never read: only field names, and the chosen option of selects and radio buttons.

const SCROLL_MARKS = [25, 50, 75, 100];
const CLICKABLE = "a,button,summary,[role=button],[data-j],input[type=radio],input[type=checkbox]";

function fieldName(el: Element) {
  return (el.getAttribute("data-j-field") || el.getAttribute("name") || el.id || "").replace(/^f-/, "").slice(0, 40);
}

function labelOf(el: Element) {
  const own = el.getAttribute("data-j") || el.getAttribute("aria-label");
  if (own) return own.slice(0, 60);
  if (el instanceof HTMLInputElement) return `${el.type}:${fieldName(el)}`;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || el.tagName.toLowerCase();
}

export function Journey() {
  const pathname = usePathname();
  const locale = useRouteLocale();

  useEffect(() => {
    newPage(locale);
    const url = new URL(location.href);
    let ref = "";
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : "";
    } catch {}
    jlog("page_view", {
      ref,
      utm_campaign: url.searchParams.get("utm_campaign"),
      utm_content: url.searchParams.get("utm_content"),
      vw: window.innerWidth,
      vh: window.innerHeight,
    });

    // Time on page: total and while the tab was visible.
    let visibleMs = 0;
    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let maxScroll = 0;
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      if (visibleSince !== null) visibleMs += performance.now() - visibleSince;
      jlog("page_leave", { dur: pageMs(), active: Math.round(visibleMs), scroll: maxScroll });
      flushJourney();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (visibleSince !== null) visibleMs += performance.now() - visibleSince;
        visibleSince = null;
        flushJourney();
      } else visibleSince = performance.now();
    };

    // Scroll depth milestones.
    const marks = new Set<number>();
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h > 0 ? Math.min(100, Math.round((window.scrollY / h) * 100)) : 100;
      maxScroll = Math.max(maxScroll, pct);
      for (const m of SCROLL_MARKS) if (pct >= m && !marks.has(m)) {
        marks.add(m);
        jlog("scroll", { pct: m });
      }
    };

    // Sections seen (elements with data-j-section, or a section with an id).
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.jSection || e.target.id;
          if (e.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            jlog("section", { id });
          }
        }
      },
      { threshold: 0.35 },
    );
    const observeSections = () => document.querySelectorAll("[data-j-section], section[id]").forEach((el) => io.observe(el));
    observeSections();
    const late = setTimeout(observeSections, 2000);

    // Clicks and rage clicks.
    let last: { el: Element | null; at: number; n: number } = { el: null, at: 0, n: 0 };
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as Element | null)?.closest?.(CLICKABLE);
      const now = performance.now();
      const target = el ?? (ev.target as Element | null);
      if (target && target === last.el && now - last.at < 1000) {
        last.n += 1;
        if (last.n === 3) jlog("rage_click", { label: target ? labelOf(target) : "page" });
      } else last = { el: target, at: now, n: 1 };
      last.at = now;
      if (!el) return;
      const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") ?? "" : "";
      jlog("click", { label: labelOf(el), ...(href ? { href: href.split("?")[0].slice(0, 120) } : {}) });
    };

    // Form fields: first focus, left filled in, choice made (selects and radios only), errors shown.
    const focused = new Set<string>();
    const onFocus = (ev: FocusEvent) => {
      const el = ev.target as Element;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      const f = fieldName(el);
      if (!f || focused.has(f)) return;
      focused.add(f);
      jlog("field_focus", { field: f });
    };
    const onBlur = (ev: FocusEvent) => {
      const el = ev.target as Element;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || ["radio", "checkbox", "submit", "button"].includes((el as HTMLInputElement).type)) return;
      const f = fieldName(el);
      if (f) jlog("field_done", { field: f, filled: el.value.trim().length > 0 });
    };
    const onChange = (ev: Event) => {
      const el = ev.target as Element;
      if (el instanceof HTMLSelectElement) jlog("field_done", { field: fieldName(el), value: el.value.slice(0, 20) });
      else if (el instanceof HTMLInputElement && el.type === "radio") jlog("field_done", { field: fieldName(el), value: el.value.slice(0, 30) });
      else if (el instanceof HTMLInputElement && el.type === "checkbox") jlog("field_done", { field: fieldName(el), checked: el.checked });
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target as Element;
        if (el.getAttribute("aria-invalid") !== "true") continue;
        const msgId = el.getAttribute("aria-describedby");
        const msg = msgId ? document.getElementById(msgId)?.textContent?.trim().slice(0, 100) : undefined;
        jlog("field_error", { field: fieldName(el), ...(msg ? { msg } : {}) });
      }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });

    // JavaScript errors (at most 5 per page).
    let errs = 0;
    const onError = (ev: ErrorEvent | PromiseRejectionEvent) => {
      if (errs++ >= 5) return;
      const msg = "message" in ev ? ev.message : String((ev as PromiseRejectionEvent).reason ?? "rejection");
      const at = "filename" in ev && ev.filename ? `${ev.filename.split("/").pop()}:${ev.lineno}` : "";
      jlog("js_error", { msg: msg.slice(0, 160), at });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("change", onChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    onScroll();
    return () => {
      leave();
      clearTimeout(late);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
    };
  }, [pathname, locale]);

  return null;
}
