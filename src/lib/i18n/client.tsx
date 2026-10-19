"use client";

import { createContext, useContext, useMemo } from "react";
import type { Country, Locale } from "../markets";
import type { Dict } from "./pt";
import { moneyFor, moneyShortFor } from "./format";

type I18n = { locale: Locale; country: Country; languages: Locale[]; d: Dict; money: (c: number) => string; moneyShort: (c: number) => string; guide: boolean };
const Ctx = createContext<I18n | null>(null);

/** The dictionary comes from the server (plain strings, serialisable); formatting helpers are built here. */
/** guide: whether this language's edition of the gift e-book is offered (server decides, see lib/ebook). */
export function I18nProvider({ locale, country, languages = [locale], dict, guide = locale === "pt", children }: { locale: Locale; country: Country; languages?: Locale[]; dict: Dict; guide?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, country, languages, d: dict, money: moneyFor(locale), moneyShort: moneyShortFor(locale), guide }), [locale, country, languages, dict, guide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
