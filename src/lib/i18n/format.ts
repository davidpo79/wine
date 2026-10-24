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

/**
 * Delivery days as typed in Admin → Settings for Portugal ("2 a 4", in Portuguese), in the page language. Russian is
 * the only other language of the Portugal market, so only Russian needs it: "2 a 4" -> "2-4".
 */
export function deliveryDaysFor(locale: Locale, days: string) {
  return locale === "ru" ? days.replace(/\s+a\s+/g, "-") : days;
}

/** Day and month of a cutoff, as short messages say it: "30/11" (pt), "30.11" (ru), "30.11." (de). */
export function dayMonthFor(locale: Locale, iso: string) {
  return new Date(iso).toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" });
}

export function dateFor(locale: Locale, iso: string) {
  return new Date(iso).toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" });
}
