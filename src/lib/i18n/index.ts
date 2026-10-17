import { pt, type Dict } from "./pt";
import { de } from "./de";
import { nl } from "./nl";
import { fr } from "./fr";
import type { Locale } from "../markets";

export type { Dict } from "./pt";
export { fmt, rich, Rich } from "./rich";

const DICTS: Record<Locale, Dict> = { pt, de, nl, fr };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? pt;
}

export { moneyFor, moneyShortFor, dateFor } from "./format";
