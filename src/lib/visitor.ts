import { cookies, headers } from "next/headers";
import { getAdmin } from "./auth";
import { countryOfIp } from "./geo";
import { COUNTRIES, COUNTRIES_FOR_LOCALE, defaultCountry, isCountry, isLocale, localeFromAcceptLanguage, MARKETS, type Country, type Locale } from "./markets";
import { clientIp } from "./request";
import type { Settings } from "./settings-defaults";
import { LOCALE_COOKIE } from "./i18n/paths";
import { bfOpenCountries, isBfBundle } from "./black-friday";

/** Markets taking orders. Logged-in admins see every market as open (to preview and test before launch). */
export async function enabledCountries(settings: Settings): Promise<Country[]> {
  const on = (Object.keys(settings.markets) as Country[]).filter((c) => isCountry(c) && settings.markets[c]?.enabled);
  if (await getAdmin().catch(() => null)) return [...COUNTRIES];
  return on.length ? on : ["PT"];
}

/** Countries an order may be delivered to: the Black Friday countries for its boxes, else the open markets. */
export async function countriesForOrder(order: { bundleKey: string }, settings: Settings): Promise<Country[]> {
  if (!isBfBundle(order.bundleKey)) return enabledCountries(settings);
  if (await getAdmin().catch(() => null)) return [...settings.black_friday.countries];
  return bfOpenCountries(settings.black_friday);
}

export function languagesOf(countries: Country[]): Locale[] {
  const out: Locale[] = [];
  for (const c of countries) for (const l of MARKETS[c].locales) if (!out.includes(l)) out.push(l);
  return out;
}

export type Visitor = { ipCountry: string | null; savedLocale: Locale | null; browserLocale: Locale | null };

export async function visitor(): Promise<Visitor> {
  const h = await headers();
  const c = await cookies();
  const saved = c.get(LOCALE_COOKIE)?.value;
  return { ipCountry: countryOfIp(clientIp(h)), savedLocale: isLocale(saved) ? saved : null, browserLocale: localeFromAcceptLanguage(h.get("accept-language")) };
}

/**
 * Where a visitor of the Portuguese home page should go: their saved language, else the language of the country of
 * their IP (if that market is open), else stay. Portuguese visitors and everyone else stay on "/".
 */
export function homeLocaleFor(v: Visitor, open: Country[]): Locale {
  if (v.savedLocale) return v.savedLocale;
  if (isCountry(v.ipCountry) && open.includes(v.ipCountry)) {
    const m = MARKETS[v.ipCountry];
    return v.browserLocale && m.locales.includes(v.browserLocale) ? v.browserLocale : m.locales[0];
  }
  return "pt";
}

/** Delivery country preselected for a language page: the IP country if it speaks this language, else the default. */
export function countryFor(locale: Locale, v: Visitor): Country {
  if (isCountry(v.ipCountry) && COUNTRIES_FOR_LOCALE[locale].includes(v.ipCountry)) return v.ipCountry;
  return defaultCountry(locale);
}
