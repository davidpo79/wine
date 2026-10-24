"use client";

import { useEffect, useRef } from "react";
import { jlog } from "@/lib/journey-client";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_INFO, type Locale } from "@/lib/markets";
import { homeHref, LOCALE_COOKIE } from "@/lib/i18n/paths";

// Inline SVG flags: Windows does not draw flag emoji (it shows the letters).
const FLAGS: Record<Locale, React.ReactNode> = {
  pt: (
    <>
      <rect width="18" height="12" fill="#da291c" />
      <rect width="7.2" height="12" fill="#046a38" />
      <circle cx="7.2" cy="6" r="2.4" fill="#ffe900" />
    </>
  ),
  de: (
    <>
      <rect width="18" height="4" fill="#000" />
      <rect y="4" width="18" height="4" fill="#dd0000" />
      <rect y="8" width="18" height="4" fill="#ffce00" />
    </>
  ),
  nl: (
    <>
      <rect width="18" height="4" fill="#ae1c28" />
      <rect y="4" width="18" height="4" fill="#fff" />
      <rect y="8" width="18" height="4" fill="#21468b" />
    </>
  ),
  // French is sold to Belgium (and Luxembourg), so it carries the Belgian flag.
  fr: (
    <>
      <rect width="6" height="12" fill="#000" />
      <rect x="6" width="6" height="12" fill="#fdda24" />
      <rect x="12" width="6" height="12" fill="#ef3340" />
    </>
  ),
  // Russian is a language of the Portugal market (not a country we sell to): a neutral language badge, no flag.
  ru: (
    <>
      <rect width="18" height="12" rx="2" fill="#184b36" />
      <text x="9" y="9" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="Arial, sans-serif" fill="#fff">RU</text>
    </>
  ),
};

function Flag({ l }: { l: Locale }) {
  return (
    <svg className="langflag" viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">
      {FLAGS[l]}
    </svg>
  );
}

/** Dropdown of the shop's languages (only those of markets that take orders). Remembers the choice for a year. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, languages, d } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // Close when clicking elsewhere or pressing Escape.
    const close = (e: Event) => {
      const el = ref.current;
      if (el?.open && (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !el.contains(e.target as Node))) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  if (languages.length < 2) return null;
  return (
    <details ref={ref} className={compact ? "langswitch langcompact" : "langswitch"}>
      <summary aria-label={`${d.common.languageLabel}: ${LOCALE_INFO[locale].name}`}>
        <Flag l={locale} />
        <span>{compact ? locale.toUpperCase() : LOCALE_INFO[locale].name}</span>
      </summary>
      <ul>
        {languages.map((l) => (
          <li key={l}>
            {l === locale ? (
              <span aria-current="true">
                <Flag l={l} /> {LOCALE_INFO[l].name}
              </span>
            ) : (
              <a
                href={homeHref(l)}
                hrefLang={l}
                lang={l}
                onClick={() => {
                  jlog("lang_switch", { to: l });
                  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
                }}
              >
                <Flag l={l} /> {LOCALE_INFO[l].name}
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
