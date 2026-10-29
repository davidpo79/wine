// The gift recipe book "Sabores de Portugal": one PDF per language in the private bucket.
// A language offers the guide (landing, checkout, confirmation email) only once its PDF is uploaded in Admin → Settings.
import type { Locale } from "./markets";
import { SITE } from "./site";

export const EBOOK_LOCALES = ["pt", "de", "nl", "fr", "ru", "en", "es"] as const satisfies readonly Locale[];

export function ebookKey(locale: Locale) {
  return locale === "pt" ? SITE.ebookKey : SITE.ebookKey.replace(/\.pdf$/, `-${locale}.pdf`);
}

const TITLES: Record<Locale, string> = {
  pt: SITE.ebookTitle,
  de: "Sabores de Portugal: Traditionelle Rezepte zum Teilen",
  nl: "Sabores de Portugal: Traditionele recepten om te delen",
  fr: "Sabores de Portugal : recettes traditionnelles à partager",
  ru: "Sabores de Portugal: традиционные рецепты, которыми хочется делиться",
  en: "Sabores de Portugal: traditional recipes to share",
  es: "Sabores de Portugal: recetas tradicionales para compartir",
};

const FILES: Record<Locale, string> = {
  pt: "Sabores-de-Portugal-Receitas.pdf",
  de: "Sabores-de-Portugal-Rezepte.pdf",
  nl: "Sabores-de-Portugal-Recepten.pdf",
  fr: "Sabores-de-Portugal-Recettes.pdf",
  ru: "Sabores-de-Portugal-Retsepty.pdf",
  en: "Sabores-de-Portugal-Recipes.pdf",
  es: "Sabores-de-Portugal-Recetas.pdf",
};

export const ebookTitle = (locale: Locale) => TITLES[locale] ?? SITE.ebookTitle;
export const ebookFileName = (locale: Locale) => FILES[locale] ?? FILES.pt;

/** Whether customers in this language get the guide. Portuguese always does (the original edition). */
export function guideFor(settings: { ebook_locales?: string[] }, locale: Locale) {
  return locale === "pt" || (settings.ebook_locales ?? []).includes(locale);
}

/** Landing images of the guide cover: the Portuguese files, or `<name>.<locale>.webp` for a translated edition. */
export const guideImage = (name: "guide" | "guide-768" | "guide-thumb", locale: Locale) => `/lp/${name}${locale === "pt" ? "" : `.${locale}`}.webp`;
