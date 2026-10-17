import { LOCALE_INFO, type Locale } from "../markets";

/** 8490 -> "84,90 €" (pt/de/fr) or "€ 84,90" (nl). */
export function moneyFor(locale: Locale) {
  const f = new Intl.NumberFormat(LOCALE_INFO[locale].intl, { style: "currency", currency: "EUR" });
  return (cents: number) => f.format(cents / 100).replace(/ /g, " ");
}

/** Whole euros without decimals: 4000 -> "40 €"; 3990 -> "39,90 €". */
export function moneyShortFor(locale: Locale) {
  const whole = new Intl.NumberFormat(LOCALE_INFO[locale].intl, { style: "currency", currency: "EUR", maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const full = moneyFor(locale);
  return (cents: number) => (cents % 100 === 0 ? whole.format(cents / 100).replace(/ /g, " ") : full(cents));
}

export function dateFor(locale: Locale, iso: string) {
  return new Date(iso).toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" });
}
