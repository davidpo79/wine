"use client";

import { usePathname } from "next/navigation";
import { isLocale, type Locale } from "../markets";
import { LOCALE_COOKIE } from "./paths";

/**
 * Language of the current page for components outside the I18nProvider (cookie banner): /de/... -> de; else ?l=;
 * else the page's data-locale marker; else the saved choice; else pt.
 */
export function useRouteLocale(): Locale {
  const path = usePathname() ?? "/";
  const seg = path.split("/")[1];
  if (isLocale(seg)) return seg;
  if (typeof document !== "undefined") {
    // The landing page opens the checkout as /checkout?...&l=ru when the language is not Portuguese.
    const l = new URLSearchParams(location.search).get("l");
    if (isLocale(l)) return l;
    // Pages without a language prefix (such as /obrigado) mark their content with data-locale.
    const marked = document.querySelector("[data-locale]")?.getAttribute("data-locale");
    if (isLocale(marked)) return marked;
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    if (m && isLocale(m[1]) && path !== "/") return m[1];
  }
  return "pt";
}
