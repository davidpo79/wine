// Countries we can sell to and the languages the site speaks. Portugal ships from the Douro (CTT, MB WAY,
// Multibanco); Germany, the Netherlands, Belgium and Luxembourg ship from the Belgian warehouse (pricing of 17/10/2026).
// Russian is a language of the Portugal market (the Russian-speaking community living in Portugal), not a country:
// same products, prices, CTT delivery and payment methods as Portuguese. English is the same: English speakers living in Portugal.
// A market only takes orders once it is enabled in Admin → Settings (excise and VAT must be sorted first).

export const LOCALES = ["pt", "de", "nl", "fr", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const COUNTRIES = ["PT", "DE", "NL", "BE", "LU"] as const;
export type Country = (typeof COUNTRIES)[number];

export const isLocale = (x: unknown): x is Locale => typeof x === "string" && (LOCALES as readonly string[]).includes(x);
export const isCountry = (x: unknown): x is Country => typeof x === "string" && (COUNTRIES as readonly string[]).includes(x);

export const LOCALE_INFO: Record<Locale, { intl: string; htmlLang: string; og: string; name: string }> = {
  pt: { intl: "pt-PT", htmlLang: "pt-PT", og: "pt_PT", name: "Português" },
  de: { intl: "de-DE", htmlLang: "de", og: "de_DE", name: "Deutsch" },
  nl: { intl: "nl-NL", htmlLang: "nl", og: "nl_NL", name: "Nederlands" },
  fr: { intl: "fr-BE", htmlLang: "fr", og: "fr_BE", name: "Français" },
  ru: { intl: "ru-RU", htmlLang: "ru", og: "ru_RU", name: "Русский" },
  en: { intl: "en-IE", htmlLang: "en", og: "en_GB", name: "English" },
};

export type Market = {
  country: Country;
  locales: Locale[]; // first = default for visitors from this country
  callingCode: string; // +351
  postal: RegExp;
  postalExample: string;
  /** Postal codes we cannot deliver to (Madeira and the Azores start with 9). */
  postalExcluded?: RegExp;
  /** Local payment methods (ifthenpay, Portugal only). Cards, Apple Pay and Google Pay go through Stripe everywhere. */
  localMethods: ("mbway" | "multibanco")[];
  /** Extra Stripe redirect methods (must be enabled in the Stripe dashboard). */
  stripeRedirectMethods: ("ideal" | "bancontact")[];
  warehouse: "douro" | "belgium";
};

export const MARKETS: Record<Country, Market> = {
  PT: { country: "PT", locales: ["pt", "ru", "en"], callingCode: "+351", postal: /^\d{4}-?\d{3}$/, postalExample: "1000-001", postalExcluded: /^9/, localMethods: ["mbway", "multibanco"], stripeRedirectMethods: [], warehouse: "douro" },
  DE: { country: "DE", locales: ["de"], callingCode: "+49", postal: /^\d{5}$/, postalExample: "10115", localMethods: [], stripeRedirectMethods: [], warehouse: "belgium" },
  NL: { country: "NL", locales: ["nl"], callingCode: "+31", postal: /^\d{4} ?[A-Za-z]{2}$/, postalExample: "1012 AB", localMethods: [], stripeRedirectMethods: ["ideal"], warehouse: "belgium" },
  BE: { country: "BE", locales: ["nl", "fr"], callingCode: "+32", postal: /^\d{4}$/, postalExample: "1000", localMethods: [], stripeRedirectMethods: ["bancontact"], warehouse: "belgium" },
  LU: { country: "LU", locales: ["fr", "de"], callingCode: "+352", postal: /^(L-?)?\d{4}$/i, postalExample: "L-1009", localMethods: [], stripeRedirectMethods: [], warehouse: "belgium" },
};

/** Countries whose shop speaks this language (the order matters: first = the one we preselect). */
export const COUNTRIES_FOR_LOCALE: Record<Locale, Country[]> = { pt: ["PT"], de: ["DE", "LU"], nl: ["NL", "BE"], fr: ["BE", "LU"], ru: ["PT"], en: ["PT"] };

export function defaultCountry(locale: Locale): Country {
  return COUNTRIES_FOR_LOCALE[locale][0];
}

/** Visitor's language from the browser (Accept-Language), used when the IP gives no market. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    const base = tag.split("-")[0];
    // English is never picked from the browser: many Portuguese use phones set to English. /en is reached by link or
    // by choosing it in the language switcher.
    if (base === "en") continue;
    if (isLocale(base)) return base;
  }
  return null;
}

/** National number -> international (+49 151 2345678 from 0151 2345678 in Germany). */
export function normalizePhoneFor(input: string, country: Country): string | null {
  let d = input.replace(/[\s().\-/]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (!d.startsWith("+")) {
    const cc = MARKETS[country].callingCode;
    if (country === "PT") d = `${cc}${d}`;
    else if (d.startsWith("0")) d = `${cc}${d.slice(1)}`;
    else d = `${cc}${d}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** Tidies what people type: Portuguese "1000 001" / "1000001" / "1000–001" become "1000-001". */
export function normalizePostal(postal: string, country: Country): string {
  const p = postal.trim();
  const pt = country === "PT" ? p.match(/^(\d{4})[\s\u2010-\u2015-]*(\d{3})$/) : null;
  return pt ? `${pt[1]}-${pt[2]}` : p;
}

export function postalValid(postal: string, country: Country): "ok" | "format" | "excluded" {
  const m = MARKETS[country];
  const p = normalizePostal(postal, country);
  if (!m.postal.test(p)) return "format";
  if (m.postalExcluded?.test(p)) return "excluded";
  return "ok";
}
