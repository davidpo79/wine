import type { ComponentType, ReactNode } from "react";
import type { LegalKind } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/markets";
import * as de from "./de";
import * as nl from "./nl";
import * as fr from "./fr";
import * as ru from "./ru";

// A body may be an async server component (the Russian shipping page reads the catalog for the delivery price).
type Pages = Record<LegalKind, ComponentType | (() => Promise<ReactNode>)>;

/** Legal page bodies per language (de/nl/fr: drafts for legal review; ru: translation of the Portuguese pages). */
export const LEGAL_CONTENT: Partial<Record<Locale, Pages>> = {
  de: { terms: de.Terms, privacy: de.Privacy, shipping: de.Shipping },
  nl: { terms: nl.Terms, privacy: nl.Privacy, shipping: nl.Shipping },
  fr: { terms: fr.Terms, privacy: fr.Privacy, shipping: fr.Shipping },
  ru: { terms: ru.Terms, privacy: ru.Privacy, shipping: ru.Shipping },
};

/** "Last updated" date of the published (non-draft) translations. Russian follows the Portuguese pages. */
export const LEGAL_UPDATED: Partial<Record<Locale, string>> = {
  ru: "1 октября 2026 г.",
};
