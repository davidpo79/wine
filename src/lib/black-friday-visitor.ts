import { bfLocaleFor, isBfLocale, type BfLocale } from "./black-friday";
import type { Visitor } from "./visitor";

/**
 * Language of the Black Friday page for a visitor: the language they chose before (if German or Spanish), else their
 * phone / browser language, else their country (IP: Spain -> es; Germany, Austria, Switzerland, Luxembourg -> de).
 * null = nothing tells (a crawler, a visitor from elsewhere): keep the page they asked for.
 */
export function bfLocaleForVisitor(v: Visitor): BfLocale | null {
  if (isBfLocale(v.savedLocale)) return v.savedLocale;
  if (v.savedLocale) return null; // chose another language of the shop: no guessing
  if (isBfLocale(v.browserLocale)) return v.browserLocale;
  return bfLocaleFor(v.ipCountry);
}
