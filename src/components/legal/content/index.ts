import type { ComponentType } from "react";
import type { LegalKind } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/markets";
import * as de from "./de";
import * as nl from "./nl";
import * as fr from "./fr";

type Pages = Record<LegalKind, ComponentType>;

/** Legal page bodies per language (drafts for legal review, same structure as the Portuguese pages). */
export const LEGAL_CONTENT: Partial<Record<Locale, Pages>> = {
  de: { terms: de.Terms, privacy: de.Privacy, shipping: de.Shipping },
  nl: { terms: nl.Terms, privacy: nl.Privacy, shipping: nl.Shipping },
  fr: { terms: fr.Terms, privacy: fr.Privacy, shipping: fr.Shipping },
};
