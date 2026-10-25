import type { Locale } from "../markets";

// Portuguese keeps the original URLs; other languages live under /de, /nl, /fr, /ru, /en with their own legal slugs.
export type LegalKind = "terms" | "privacy" | "shipping";

export const LEGAL_SLUGS: Record<Locale, Record<LegalKind, string>> = {
  pt: { terms: "termos", privacy: "privacidade", shipping: "envios-devolucoes" },
  de: { terms: "agb", privacy: "datenschutz", shipping: "versand-rueckgabe" },
  nl: { terms: "voorwaarden", privacy: "privacy", shipping: "verzending-retour" },
  fr: { terms: "conditions", privacy: "confidentialite", shipping: "livraison-retours" },
  ru: { terms: "usloviya", privacy: "konfidentsialnost", shipping: "dostavka-i-vozvrat" },
  en: { terms: "terms", privacy: "privacy", shipping: "delivery-returns" },
};

export function homeHref(locale: Locale) {
  return locale === "pt" ? "/" : `/${locale}`;
}

export function legalHref(kind: LegalKind, locale: Locale) {
  return locale === "pt" ? `/${LEGAL_SLUGS.pt[kind]}` : `/${locale}/${LEGAL_SLUGS[locale][kind]}`;
}

export function legalKindFromSlug(locale: Locale, slug: string): LegalKind | null {
  const e = Object.entries(LEGAL_SLUGS[locale]).find(([, s]) => s === slug);
  return (e?.[0] as LegalKind) ?? null;
}

export const LOCALE_COOKIE = "wp_locale";
