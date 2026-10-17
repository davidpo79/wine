"use client";

import { usePathname } from "next/navigation";
import { isLocale, type Locale } from "../markets";
import { LOCALE_COOKIE } from "./paths";

/** Language of the current page for components outside the I18nProvider (cookie banner): /de/... -> de; else the saved choice; else pt. */
export function useRouteLocale(): Locale {
  const path = usePathname() ?? "/";
  const seg = path.split("/")[1];
  if (isLocale(seg)) return seg;
  if (typeof document !== "undefined") {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    if (m && isLocale(m[1]) && path !== "/") return m[1];
  }
  return "pt";
}
