import { pt, type Dict } from "./pt";
import { de } from "./de";
import { nl } from "./nl";
import { fr } from "./fr";
import { ru } from "./ru";
import { en } from "./en";
import type { Locale } from "../markets";

export type { Dict } from "./pt";
export { fmt, rich, Rich } from "./rich";

const DICTS: Record<Locale, Dict> = { pt, de, nl, fr, ru, en };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? pt;
}

/** Error texts of the shop's JSON APIs in an order's language (Portuguese when the order or its language is unknown). */
export function apiErrorsFor(o?: { locale?: string | null } | null): Dict["messages"]["apiErrors"] {
  const l = o?.locale;
  return (l && l in DICTS ? DICTS[l as Locale] : pt).messages.apiErrors;
}

export { moneyFor, moneyShortFor, dateFor, dayMonthFor, deliveryDaysFor } from "./format";
