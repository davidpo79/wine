"use client";

import { jlog } from "@/lib/journey-client";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_INFO } from "@/lib/markets";
import { homeHref, LOCALE_COOKIE } from "@/lib/i18n/paths";

/** Other languages of the shop (only those of markets that take orders). Remembers the choice for a year. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, languages, d } = useI18n();
  const others = languages.filter((l) => l !== locale);
  if (!others.length) return null;
  return (
    <nav aria-label={d.common.languageLabel} className={compact ? "langswitch langcompact" : "langswitch"}>
      {[locale, ...others].map((l) =>
        l === locale ? (
          <b key={l}>{compact ? l.toUpperCase() : LOCALE_INFO[l].name}</b>
        ) : (
          <a key={l} href={homeHref(l)} hrefLang={l} lang={l} onClick={() => {
            jlog("lang_switch", { to: l });
            document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
          }}>
            {compact ? l.toUpperCase() : LOCALE_INFO[l].name}
          </a>
        ),
      )}
    </nav>
  );
}
